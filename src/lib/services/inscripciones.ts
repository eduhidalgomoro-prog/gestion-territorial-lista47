import "server-only";
import { insertMany, readFresh, snapshot, update, updateMany, NotFoundError } from "../db";
import { ForbiddenError, UserError } from "../errors";
import { withLock } from "../lock";
import { puede, type Yo } from "../permisos";
import { CONFIRMACIONES, type Actividad, type Confirmacion, type Inscripcion, type OrigenInscripcion } from "../schema";
import { cleanString, normalizeDni, nowIso, parseFechaFlexible, today } from "../util";
import { parsePreguntas } from "../preguntas";
import { CIUDAD_CAPITAL, esCapital, esTallerEscuela, fechaNacimientoPublica, limpiarEscuela, preguntasSinRepetir, validarInscripcion, type DatosInscripcion, type RespuestasEscuela } from "../inscripcion-publica";

const SIN_RESPUESTAS_ESCUELA: RespuestasEscuela = { participo_antes: "", ex_alumna: "", quiere_ser_profe: "", ensenaria: "", conoce_espacio: "", espacio: "" };
import { ajustarPrimeraFecha, clavePersona, crearBuscador, limpiarPersona, upsertParticipantes, type PersonaInput, type PersonaLimpia } from "./participantes";

/**
 * Inscribe personas (ya creadas) a una actividad. Si ya estaban inscriptas no se duplica;
 * si se habían dado de baja, se reactiva la inscripción.
 * `cupo` (formulario público): con el cupo completo, la persona queda EN ESPERA. Se calcula dentro del bloqueo,
 * así dos personas que se anotan a la vez no pasan el límite. Sin `cupo` (carga del equipo) no hay límite
 * y quien estaba en espera pasa a inscripto.
 */
export async function inscribir(
  actividadId: string,
  items: { participanteId: string; fecha?: string; respuestas?: string; escuela?: RespuestasEscuela }[],
  origen: OrigenInscripcion,
  user: string,
  opts: { cupo?: number } = {},
): Promise<{ nuevas: number; yaEstaban: number; enEspera: number; yaEnEspera: number; inscripciones: Inscripcion[] }> {
  return withLock(`insc:${actividadId}`, async () => {
    const actuales = (await readFresh("inscripciones")).filter((i) => i.actividad_id === actividadId);
    const porPart = new Map(actuales.map((i) => [i.participante_id, i]));
    const reactivar: { id: string; patch: Partial<Inscripcion> }[] = [];
    const crear: Omit<Inscripcion, "id" | "creado" | "actualizado" | "actualizado_por" | "version">[] = [];
    const vistos = new Set<string>();
    const conCupo = !!opts.cupo && opts.cupo > 0;
    let libres = conCupo ? opts.cupo! - actuales.filter((i) => i.estado === "INSCRIPTO").length : Infinity;
    let yaEstaban = 0, enEspera = 0, yaEnEspera = 0;
    const estadoNuevo = () => {
      if (libres > 0) {
        libres--;
        return "INSCRIPTO" as const;
      }
      enEspera++;
      return "EN ESPERA" as const;
    };
    for (const it of items) {
      if (vistos.has(it.participanteId)) continue;
      vistos.add(it.participanteId);
      const ex = porPart.get(it.participanteId);
      const respuestas = Object.fromEntries(Object.entries(it.escuela ?? {}).filter(([, v]) => v));
      if (ex?.estado === "INSCRIPTO") yaEstaban++;
      else if (ex?.estado === "EN ESPERA" && conCupo) yaEnEspera++; // se volvió a anotar: sigue en la lista de espera
      else if (ex) reactivar.push({ id: ex.id, patch: { estado: conCupo ? estadoNuevo() : "INSCRIPTO", ...respuestas } });
      else
        crear.push({
          actividad_id: actividadId,
          participante_id: it.participanteId,
          fecha: it.fecha || today(),
          origen,
          estado: conCupo ? estadoNuevo() : "INSCRIPTO",
          respuestas: it.respuestas ?? "",
          confirmacion: "",
          ...(it.escuela ?? SIN_RESPUESTAS_ESCUELA),
        });
    }
    await updateMany("inscripciones", reactivar, user, "reactivar inscripción");
    const nuevas = await insertMany("inscripciones", crear, user, origen);
    const todas = [...nuevas, ...actuales.filter((i) => vistos.has(i.participante_id))];
    return { nuevas: nuevas.length + reactivar.length - enEspera, yaEstaban, enEspera, yaEnEspera, inscripciones: todas };
  });
}

/** Lista de espera → inscripto (lo decide el equipo, por ejemplo si alguien se dio de baja). */
export async function pasarAInscripto(inscripcionId: string, yo: Yo) {
  const s = await snapshot();
  const ins = s.inscripciones.find((i) => i.id === inscripcionId);
  if (!ins) throw new NotFoundError("La inscripción");
  const act = s.actividades.find((a) => a.id === ins.actividad_id);
  if (!act || !puede.editarActividad(yo, act)) throw new ForbiddenError();
  if (ins.estado !== "EN ESPERA") throw new UserError("Esa persona ya no está en la lista de espera.");
  return update("inscripciones", inscripcionId, { estado: "INSCRIPTO" }, yo.email, { accion: "de lista de espera a inscripto" });
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
// Confirmación por WhatsApp y grupo de la actividad
// (lo pueden usar quienes toman asistencia: operador asignado, responsable de la zona y administración)
// ---------------------------------------------------------------------------

async function actividadDeContacto(actividadId: string, yo: Yo) {
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === actividadId);
  if (!a) throw new NotFoundError("La actividad");
  if (!puede.contactarInscriptos(yo, a, s.asignaciones)) throw new ForbiddenError("No tenés asignada esta actividad.");
  return { a, s };
}

export async function marcarConfirmacion(inscripcionId: string, valor: string, yo: Yo) {
  const s = await snapshot();
  const ins = s.inscripciones.find((i) => i.id === inscripcionId);
  if (!ins) throw new NotFoundError("La inscripción");
  await actividadDeContacto(ins.actividad_id, yo);
  const confirmacion = (CONFIRMACIONES as readonly string[]).includes(valor) ? (valor as Confirmacion) : "";
  return update("inscripciones", inscripcionId, { confirmacion }, yo.email, { accion: `confirmación → ${confirmacion || "sin respuesta"}` });
}

export async function guardarLinkGrupo(actividadId: string, link: string, yo: Yo) {
  await actividadDeContacto(actividadId, yo);
  const l = cleanString(link, 300);
  if (l && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(l)) {
    throw new UserError("Pegá el link de invitación del grupo (empieza con https://chat.whatsapp.com/).", { link_grupo: "Link inválido." });
  }
  return update("actividades", actividadId, { link_grupo: l }, yo.email, { accion: l ? "guardar link del grupo" : "quitar link del grupo" });
}

/**
 * Mensajes propios de una actividad (confirmación e invitación al grupo).
 * Vacío = se usa el mensaje por defecto de Configuración.
 */
export async function guardarMensajes(actividadId: string, confirmacion: string, grupo: string, yo: Yo) {
  const { s } = await actividadDeContacto(actividadId, yo);
  const limpiar = (t: string) => t.replace(/\r\n/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, 1000);
  let c = limpiar(confirmacion);
  let g = limpiar(grupo);
  if (g && !g.includes("{link_grupo}")) throw new UserError("El mensaje de invitación tiene que incluir {link_grupo}.", { mensaje_grupo: "Falta {link_grupo}." });
  // Si queda igual al de Configuración, se guarda vacío (así sigue los cambios del mensaje general).
  if (c === s.config.mensaje_confirmacion) c = "";
  if (g === s.config.mensaje_grupo) g = "";
  return update("actividades", actividadId, { mensaje_confirmacion: c, mensaje_grupo: g }, yo.email, { accion: "mensajes de WhatsApp" });
}

// ---------------------------------------------------------------------------
// Importación desde Google Forms (Excel / CSV)
// ---------------------------------------------------------------------------

export interface FilaImportada extends PersonaInput {
  fecha?: string; // marca temporal del formulario
  respuestas?: string; // otras preguntas del formulario: «Pregunta: respuesta» por línea
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
  const ok: { fila: number; persona: PersonaLimpia; fecha: string; respuestas: string }[] = [];
  const errores: { fila: number; motivo: string }[] = [];
  filas.forEach((f, i) => {
    try {
      const persona = limpiarPersona({
        nombre: String(f.nombre ?? ""), apellido: String(f.apellido ?? ""), dni: String(f.dni ?? ""),
        telefono: String(f.telefono ?? ""), barrio: String(f.barrio ?? ""),
        direccion: String(f.direccion ?? ""), fecha_nacimiento: String(f.fecha_nacimiento ?? ""),
      }, { dniOpcional: true }); // listas viejas: alcanza con teléfono si no hay DNI
      ok.push({ fila: i + 2, persona, fecha: parseFechaFlexible(f.fecha), respuestas: cleanString(String(f.respuestas ?? ""), 2000) });
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
  // Misma lógica que al guardar (sin DNI: teléfono + nombre, así no se confunden familiares).
  const { buscar, mismoTelefono } = crearBuscador(s.participantes);
  const inscriptos = new Set(s.inscripciones.filter((i) => i.actividad_id === actividadId && i.estado === "INSCRIPTO").map((i) => i.participante_id));
  const vistos = new Set<string>();
  let nuevos = 0, existentes = 0, yaInscriptos = 0, repetidos = 0, alertas = 0;
  for (const { persona } of ok) {
    const clave = clavePersona(persona);
    if (vistos.has(clave)) {
      repetidos++;
      continue;
    }
    vistos.add(clave);
    const ex = buscar(persona);
    if (ex) {
      existentes++;
      if (inscriptos.has(ex.id)) yaInscriptos++;
    } else {
      nuevos++;
      // Comparte teléfono con otra persona ya cargada: se crea aparte y se marca para revisar.
      if (mismoTelefono(persona.telefono).length) alertas++;
    }
  }
  return { total: filas.length, validas: ok.length, nuevos, existentes, yaInscriptos, repetidosEnArchivo: repetidos, alertasTelefono: alertas, errores: errores.slice(0, 200) };
}

export async function confirmarImportacion(actividadId: string, filas: FilaImportada[], yo: Yo) {
  await actividadImportable(actividadId, yo);
  const { ok, errores } = prepararFilas(filas);
  if (!ok.length) throw new UserError("Ninguna fila tiene los datos mínimos (nombre y apellido).");
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
    res.map((r, i) => ({ participanteId: r.participante.id, fecha: ok[i].fecha || today(), respuestas: ok[i].respuestas })),
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

export interface InscripcionPublicaInput extends DatosInscripcion {
  respuestas: { pregunta: string; respuesta: string }[];
  escuela: RespuestasEscuela;
}

export type ResultadoPublico =
  | { status: "inscripto"; nombre: string }
  | { status: "ya_inscripto"; nombre: string }
  | { status: "en_espera"; nombre: string } // cupo completo: quedó en la lista de espera
  | { status: "cerrada"; motivo: string };

/** Lugares del formulario: cupo, inscriptos, libres y en espera (cupo 0 = sin límite; las ferias tienen el suyo). */
export function lugaresActividad(a: Actividad, inscripciones: Pick<Inscripcion, "actividad_id" | "estado">[]) {
  const cupo = a.es_feria ? 0 : Math.max(0, a.cupo || 0);
  const propias = inscripciones.filter((i) => i.actividad_id === a.id);
  const inscriptos = propias.filter((i) => i.estado === "INSCRIPTO").length;
  const enEspera = propias.filter((i) => i.estado === "EN ESPERA").length;
  return { cupo, inscriptos, enEspera, libres: cupo ? Math.max(0, cupo - inscriptos) : null };
}

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
  // Mismas reglas y mensajes que ve la persona en el navegador.
  const errores = validarInscripcion(input);
  if (Object.keys(errores).length) throw new UserError("Revisá los datos marcados en rojo.", errores);
  const persona = limpiarPersona(
    { ...input, ciudad: esCapital(input.ciudad) ? CIUDAD_CAPITAL : input.ciudad, fecha_nacimiento: fechaNacimientoPublica(input.fecha_nacimiento) },
    { telefonoObligatorio: true, barrioObligatorio: esCapital(input.ciudad) }, // en el interior el barrio es opcional
  );
  const escuela = esTallerEscuela(a) ? limpiarEscuela(input.escuela, (t) => cleanString(t, 500)) : SIN_RESPUESTAS_ESCUELA;
  const preguntas = parsePreguntas(a.preguntas_extra);
  const visibles = new Set(preguntasSinRepetir(preguntas, esTallerEscuela(a)).map((x) => x.indice));
  const respuestas = preguntas
    .map((q, i) => {
      let r = visibles.has(i) ? cleanString(input.respuestas?.[i]?.respuesta ?? "", 300) : "";
      if (q.opciones && r && !q.opciones.includes(r)) r = ""; // solo opciones válidas
      return r ? `${q.texto}: ${r}` : "";
    })
    .filter(Boolean)
    .join("\n");
  const [r] = await upsertParticipantes([persona], "FORMULARIO PROPIO", "formulario-publico", { consentimiento: nowIso() });
  const res = await inscribir(a.id, [{ participanteId: r.participante.id, respuestas, escuela }], "FORMULARIO PROPIO", "formulario-publico", {
    cupo: a.es_feria ? 0 : a.cupo,
  });
  if (res.enEspera || res.yaEnEspera) return { status: "en_espera", nombre: persona.nombre };
  if (res.yaEstaban) {
    // Ya estaba inscripta en ESTE taller: no se duplica. Solo se completan respuestas que estaban vacías
    // (nunca se pisan datos: con un DNI ajeno no se puede cambiar nada de otra persona).
    const ex = res.inscripciones.find((i) => i.participante_id === r.participante.id);
    if (ex) {
      const patch: Partial<Inscripcion> = {};
      for (const k of Object.keys(escuela) as (keyof RespuestasEscuela)[]) if (!ex[k] && escuela[k]) Object.assign(patch, { [k]: escuela[k] });
      if (!ex.respuestas && respuestas) patch.respuestas = respuestas;
      if (Object.keys(patch).length) await update("inscripciones", ex.id, patch, "formulario-publico", { accion: "completar respuestas" });
    }
    return { status: "ya_inscripto", nombre: persona.nombre };
  }
  // No se devuelve ningún dato guardado: solo el nombre que escribió la persona.
  return { status: "inscripto", nombre: persona.nombre };
}

export function dniDeTexto(s: string) {
  return normalizeDni(s);
}
