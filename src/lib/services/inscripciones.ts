import "server-only";
import { insertMany, readFresh, snapshot, update, updateMany, NotFoundError } from "../db";
import { ForbiddenError, UserError } from "../errors";
import { withLock } from "../lock";
import { puede, type Yo } from "../permisos";
import type { Actividad, Inscripcion, OrigenInscripcion } from "../schema";
import { cleanString, normalizeDni, nowIso, parseFechaFlexible, phoneKey, today } from "../util";
import { ajustarPrimeraFecha, limpiarPersona, upsertParticipantes, type PersonaInput, type PersonaLimpia } from "./participantes";

/**
 * Inscribe personas (ya creadas) a una actividad. Si ya estaban inscriptas no se duplica;
 * si se habían dado de baja, se reactiva la inscripción.
 */
export async function inscribir(
  actividadId: string,
  items: { participanteId: string; fecha?: string; respuestas?: string }[],
  origen: OrigenInscripcion,
  user: string,
): Promise<{ nuevas: number; yaEstaban: number; inscripciones: Inscripcion[] }> {
  return withLock(`insc:${actividadId}`, async () => {
    const actuales = (await readFresh("inscripciones")).filter((i) => i.actividad_id === actividadId);
    const porPart = new Map(actuales.map((i) => [i.participante_id, i]));
    const reactivar: { id: string; patch: Partial<Inscripcion> }[] = [];
    const crear: Omit<Inscripcion, "id" | "creado" | "actualizado" | "actualizado_por" | "version">[] = [];
    const vistos = new Set<string>();
    let yaEstaban = 0;
    for (const it of items) {
      if (vistos.has(it.participanteId)) continue;
      vistos.add(it.participanteId);
      const ex = porPart.get(it.participanteId);
      if (ex?.estado === "INSCRIPTO") yaEstaban++;
      else if (ex) reactivar.push({ id: ex.id, patch: { estado: "INSCRIPTO" } });
      else
        crear.push({
          actividad_id: actividadId,
          participante_id: it.participanteId,
          fecha: it.fecha || today(),
          origen,
          estado: "INSCRIPTO",
          respuestas: it.respuestas ?? "",
        });
    }
    await updateMany("inscripciones", reactivar, user, "reactivar inscripción");
    const nuevas = await insertMany("inscripciones", crear, user, origen);
    const todas = [...nuevas, ...actuales.filter((i) => vistos.has(i.participante_id))];
    return { nuevas: nuevas.length + reactivar.length, yaEstaban, inscripciones: todas };
  });
}

export async function darDeBaja(inscripcionId: string, yo: Yo) {
  const s = await snapshot();
  const ins = s.inscripciones.find((i) => i.id === inscripcionId);
  if (!ins) throw new NotFoundError("La inscripción");
  const act = s.actividades.find((a) => a.id === ins.actividad_id);
  if (!act || !puede.editarActividad(yo, act)) throw new ForbiddenError();
  return update("inscripciones", inscripcionId, { estado: "DADO DE BAJA" }, yo.email, { accion: "baja de inscripción" });
}

// ---------------------------------------------------------------------------
// Importación desde Google Forms (Excel / CSV)
// ---------------------------------------------------------------------------

export interface FilaImportada extends PersonaInput {
  fecha?: string; // marca temporal del formulario
}

export interface VistaPrevia {
  total: number;
  validas: number;
  nuevos: number;
  existentes: number;
  yaInscriptos: number;
  repetidosEnArchivo: number;
  alertasTelefono: number;
  errores: { fila: number; motivo: string }[];
}

const MAX_FILAS = 3000;

function prepararFilas(filas: FilaImportada[]) {
  if (!Array.isArray(filas) || !filas.length) throw new UserError("El archivo no tiene filas para importar.");
  if (filas.length > MAX_FILAS) throw new UserError(`El archivo tiene más de ${MAX_FILAS} filas. Dividilo en partes.`);
  const ok: { fila: number; persona: PersonaLimpia; fecha: string }[] = [];
  const errores: { fila: number; motivo: string }[] = [];
  filas.forEach((f, i) => {
    try {
      const persona = limpiarPersona({
        nombre: String(f.nombre ?? ""), apellido: String(f.apellido ?? ""), dni: String(f.dni ?? ""),
        telefono: String(f.telefono ?? ""), barrio: String(f.barrio ?? ""),
      });
      ok.push({ fila: i + 2, persona, fecha: parseFechaFlexible(f.fecha) });
    } catch (e) {
      const fields = e instanceof UserError ? e.fields : undefined;
      errores.push({ fila: i + 2, motivo: fields ? Object.values(fields).join(" ") : "Datos inválidos." });
    }
  });
  return { ok, errores };
}

async function actividadImportable(actividadId: string, yo: Yo): Promise<Actividad> {
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === actividadId);
  if (!a) throw new NotFoundError("La actividad");
  if (!puede.importar(yo, a)) throw new ForbiddenError();
  return a;
}

export async function vistaPreviaImportacion(actividadId: string, filas: FilaImportada[], yo: Yo): Promise<VistaPrevia> {
  await actividadImportable(actividadId, yo);
  const { ok, errores } = prepararFilas(filas);
  const s = await snapshot({ fresh: true });
  const porDni = new Map(s.participantes.map((p) => [p.dni, p]));
  const telDe = new Map<string, string>();
  for (const p of s.participantes) {
    const k = phoneKey(p.telefono);
    if (k) telDe.set(k, p.dni);
  }
  const inscriptos = new Set(s.inscripciones.filter((i) => i.actividad_id === actividadId && i.estado === "INSCRIPTO").map((i) => i.participante_id));
  const vistos = new Set<string>();
  let nuevos = 0, existentes = 0, yaInscriptos = 0, repetidos = 0, alertas = 0;
  for (const { persona } of ok) {
    if (vistos.has(persona.dni)) {
      repetidos++;
      continue;
    }
    vistos.add(persona.dni);
    const ex = porDni.get(persona.dni);
    if (ex) {
      existentes++;
      if (inscriptos.has(ex.id)) yaInscriptos++;
    } else {
      nuevos++;
      const k = phoneKey(persona.telefono);
      if (k && telDe.has(k) && telDe.get(k) !== persona.dni) alertas++;
    }
  }
  return { total: filas.length, validas: ok.length, nuevos, existentes, yaInscriptos, repetidosEnArchivo: repetidos, alertasTelefono: alertas, errores: errores.slice(0, 200) };
}

export async function confirmarImportacion(actividadId: string, filas: FilaImportada[], yo: Yo) {
  await actividadImportable(actividadId, yo);
  const { ok, errores } = prepararFilas(filas);
  if (!ok.length) throw new UserError("Ninguna fila tiene los datos mínimos (nombre, apellido y DNI).");
  const res = await upsertParticipantes(ok.map((o) => o.persona), "GOOGLE FORMS", yo.email);
  // Primera inscripción: si el formulario trae marca temporal, se usa esa fecha.
  const porFecha = new Map<string, string[]>();
  res.forEach((r, i) => {
    const f = ok[i].fecha;
    if (f && r.nuevo) porFecha.set(f, [...(porFecha.get(f) ?? []), r.participante.id]);
  });
  for (const [fecha, ids] of porFecha) await ajustarPrimeraFecha(ids, fecha, yo.email);
  const insc = await inscribir(
    actividadId,
    res.map((r, i) => ({ participanteId: r.participante.id, fecha: ok[i].fecha || today() })),
    "GOOGLE FORMS",
    yo.email,
  );
  return {
    importadas: ok.length,
    personasNuevas: res.filter((r) => r.nuevo).length,
    inscripcionesNuevas: insc.nuevas,
    yaInscriptos: insc.yaEstaban,
    conErrores: errores.length,
  };
}

// ---------------------------------------------------------------------------
// Formulario público (sin usuario). Solo permite ENVIAR: nunca devuelve datos de la base.
// ---------------------------------------------------------------------------

export interface InscripcionPublicaInput extends PersonaInput {
  respuestas: { pregunta: string; respuesta: string }[];
  consentimiento: boolean;
}

export type ResultadoPublico = { status: "inscripto"; nombre: string } | { status: "cerrada"; motivo: string };

export function inscripcionAbiertaPublica(a: Actividad): { abierta: boolean; motivo: string } {
  if (!a.slug || !a.inscripcion_abierta) return { abierta: false, motivo: "La inscripción a esta actividad no está abierta." };
  if (["CANCELADA", "SUSPENDIDA", "REALIZADA", "BORRADOR"].includes(a.estado)) {
    return { abierta: false, motivo: a.estado === "REALIZADA" ? "Esta actividad ya se realizó. ¡Seguinos para enterarte de las próximas!" : "Esta actividad no está recibiendo inscripciones." };
  }
  if (a.fecha && a.fecha < today()) return { abierta: false, motivo: "Esta actividad ya pasó. ¡Seguinos para enterarte de las próximas!" };
  return { abierta: true, motivo: "" };
}

export async function inscribirPublico(slug: string, input: InscripcionPublicaInput): Promise<ResultadoPublico> {
  const s = await snapshot();
  const a = s.actividades.find((x) => x.slug === slug);
  if (!a) throw new UserError("No encontramos esta actividad.");
  const abierta = inscripcionAbiertaPublica(a);
  if (!abierta.abierta) return { status: "cerrada", motivo: abierta.motivo };
  const persona = limpiarPersona(input, { telefonoObligatorio: true, barrioObligatorio: true });
  if (!input.consentimiento) throw new UserError("Para inscribirte tenés que aceptar el uso de tus datos.", { consentimiento: "Marcá esta casilla para continuar." });
  const preguntas = a.preguntas_extra.split(/\r?\n/).map((q) => q.trim()).filter(Boolean);
  const respuestas = preguntas
    .map((q, i) => {
      const r = cleanString(input.respuestas?.[i]?.respuesta ?? "", 300);
      return r ? `${q}: ${r}` : "";
    })
    .filter(Boolean)
    .join("\n");
  const [r] = await upsertParticipantes([persona], "FORMULARIO PROPIO", "formulario-publico", { consentimiento: nowIso() });
  await inscribir(a.id, [{ participanteId: r.participante.id, respuestas }], "FORMULARIO PROPIO", "formulario-publico");
  // La misma respuesta exista o no la persona: el formulario no revela quién está en la base.
  return { status: "inscripto", nombre: persona.nombre };
}

export function dniDeTexto(s: string) {
  return normalizeDni(s);
}
