import "server-only";
import { insertMany, readFresh, snapshot, updateMany, NotFoundError } from "../db";
import { ForbiddenError, UserError } from "../errors";
import { withLock } from "../lock";
import { puede, type Yo } from "../permisos";
import { ESTADOS_ASISTENCIA, type Asistencia, type EstadoAsistencia } from "../schema";
import { inscribir } from "./inscripciones";
import { limpiarPersona, upsertParticipantes, type PersonaInput } from "./participantes";
import { nowIso } from "../util";

export interface Marca {
  participanteId: string;
  estado: EstadoAsistencia;
  /** Momento en que se marcó en el celular (puede ser antes si estaba sin conexión). */
  ts?: string;
}

async function actividadConAsistencia(actividadId: string, yo: Yo) {
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === actividadId);
  if (!a) throw new NotFoundError("La actividad");
  if (!puede.tomarAsistencia(yo, a, s.asignaciones)) throw new ForbiddenError("No tenés asignada esta actividad.");
  if (a.estado === "CANCELADA") throw new UserError("La actividad está cancelada.");
  return a;
}

/**
 * Guarda marcas de asistencia (una fila por persona y actividad: si ya existía, se actualiza).
 * Si llegan dos marcas para la misma persona (ej. se corrigió sin conexión), gana la más reciente.
 */
export async function guardarAsistencia(actividadId: string, marcas: Marca[], yo: Yo) {
  await actividadConAsistencia(actividadId, yo);
  const validas = marcas.filter((m) => m && typeof m.participanteId === "string" && (ESTADOS_ASISTENCIA as readonly string[]).includes(m.estado));
  if (!validas.length) return { guardadas: 0 };
  if (validas.length > 2000) throw new UserError("Demasiadas marcas en un solo envío.");
  const ultima = new Map<string, Marca>();
  for (const m of validas) {
    const prev = ultima.get(m.participanteId);
    if (!prev || (m.ts ?? "") >= (prev.ts ?? "")) ultima.set(m.participanteId, m);
  }
  return withLock(`asis:${actividadId}`, async () => {
    const [inscripciones, asistencias] = await Promise.all([readFresh("inscripciones"), readFresh("asistencias")]);
    const inscriptos = new Set(inscripciones.filter((i) => i.actividad_id === actividadId && i.estado === "INSCRIPTO").map((i) => i.participante_id));
    const existentes = new Map(asistencias.filter((a) => a.actividad_id === actividadId).map((a) => [a.participante_id, a]));
    const actualizar: { id: string; patch: Partial<Asistencia> }[] = [];
    const crear: Omit<Asistencia, "id" | "creado" | "actualizado" | "actualizado_por" | "version">[] = [];
    const ahora = Date.now();
    for (const m of ultima.values()) {
      if (!inscriptos.has(m.participanteId)) continue; // solo personas inscriptas en ESTA actividad
      // Hora en que se marcó en el celular (si estaba sin señal, es anterior al envío).
      const t = m.ts ? Date.parse(m.ts) : NaN;
      const registrado = nowIso(new Date(Number.isFinite(t) && t <= ahora ? t : ahora));
      const ex = existentes.get(m.participanteId);
      if (ex) {
        if (ex.estado !== m.estado) actualizar.push({ id: ex.id, patch: { estado: m.estado, registrado, usuario: yo.email } });
      } else {
        crear.push({ actividad_id: actividadId, participante_id: m.participanteId, estado: m.estado, registrado, usuario: yo.email });
      }
    }
    await updateMany("asistencias", actualizar, yo.email, "asistencia");
    await insertMany("asistencias", crear, yo.email, "asistencia");
    return { guardadas: actualizar.length + crear.length };
  });
}

/**
 * Persona que llegó sin inscripción: se busca/crea por DNI, se inscribe (CARGA MANUAL) y queda PRESENTE.
 */
export async function agregarPresente(actividadId: string, input: PersonaInput, yo: Yo) {
  await actividadConAsistencia(actividadId, yo);
  const persona = limpiarPersona(input);
  const [r] = await upsertParticipantes([persona], "CARGA MANUAL", yo.email);
  await inscribir(actividadId, [{ participanteId: r.participante.id }], "CARGA MANUAL", yo.email);
  await guardarAsistencia(actividadId, [{ participanteId: r.participante.id, estado: "PRESENTE" }], yo);
  return { participanteId: r.participante.id, nuevo: r.nuevo, nombre: `${r.participante.nombre} ${r.participante.apellido}` };
}

/**
 * Búsqueda por DNI para «Agregar participante»: devuelve solo nombre, apellido y barrio
 * (para confirmar que es la persona). Solo usuarios con acceso a la actividad.
 */
export async function buscarPorDni(actividadId: string, dni: string, yo: Yo) {
  await actividadConAsistencia(actividadId, yo);
  const d = dni.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 6) return null;
  const s = await snapshot();
  const p = s.participantes.find((x) => x.dni === d);
  return p ? { nombre: p.nombre, apellido: p.apellido, barrio: p.barrio, tieneTelefono: !!p.telefono } : null;
}
