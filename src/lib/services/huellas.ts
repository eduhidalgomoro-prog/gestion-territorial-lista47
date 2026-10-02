import "server-only";
import { insert, insertMany, readFresh, snapshot, update, updateMany, NotFoundError } from "../db";
import { ForbiddenError, UserError } from "../errors";
import { esMarcandoHuellas, normalizarAnimales, type AnimalInput } from "../huellas";
import { withLock } from "../lock";
import { puede, type Yo } from "../permisos";
import type { Animal, Atencion } from "../schema";
import { cleanString, normalizeDni, nowIso } from "../util";
import { limpiarPersona, upsertParticipantes } from "./participantes";

/**
 * Marcando Huellas: registro de atenciones (persona responsable → animales → prestaciones).
 * No crea inscripciones ni asistencias: es un modelo propio.
 * Pueden registrar quienes pueden tomar asistencia en la actividad (operador asignado, responsable de la zona, administración).
 */

async function operativo(actividadId: string, yo: Yo) {
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === actividadId);
  if (!a) throw new NotFoundError("La actividad");
  if (!esMarcandoHuellas(a)) throw new UserError("Esta actividad no es de Marcando Huellas.");
  if (!puede.tomarAsistencia(yo, a, s.asignaciones)) throw new ForbiddenError("No tenés asignada esta actividad.");
  return { a, s };
}

export interface AtencionInput {
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string; // vacío = mantener el que ya tiene la persona
  animales: AnimalInput[];
  observaciones?: string;
}

/** Busca a la persona por DNI para no volver a escribir sus datos (el teléfono se muestra enmascarado). */
export async function buscarResponsable(actividadId: string, dni: string, yo: Yo) {
  const { s } = await operativo(actividadId, yo);
  const d = normalizeDni(dni);
  if (!d) return null;
  const p = s.participantes.find((x) => x.dni === d);
  if (!p) return null;
  return { nombre: p.nombre, apellido: p.apellido, telefonoFinal: p.telefono ? p.telefono.slice(-4) : "" };
}

function validar(input: AtencionInput, telefonoExistente: boolean) {
  const sinTel = !cleanString(input.telefono, 40);
  const persona = limpiarPersona(
    { nombre: input.nombre, apellido: input.apellido, dni: input.dni, telefono: input.telefono, barrio: "" },
    { telefonoObligatorio: !(sinTel && telefonoExistente) },
  );
  if (!persona.dni) throw new UserError("Revisá los campos marcados.", { dni: "El DNI es obligatorio." });
  const animales = normalizarAnimales(input.animales ?? []);
  if (!animales.length) throw new UserError("Indicá al menos un animal.", { animales: "Elegí perro o gato." });
  const sinResponder = (input.animales ?? []).findIndex((x) => x.castrado === null);
  if (sinResponder >= 0) throw new UserError("Falta indicar si cada animal está castrado.", { animales: "Respondé «¿Está castrado?» en todos." });
  return { persona, animales, observaciones: cleanString(input.observaciones ?? "", 500) };
}

async function guardarPersona(persona: ReturnType<typeof limpiarPersona>, telefonoNuevo: boolean, user: string) {
  const [r] = await upsertParticipantes([persona], "CARGA MANUAL", user);
  // Si la persona ya existía y se cargó otro teléfono, se actualiza (el upsert solo completa campos vacíos).
  if (!r.nuevo && telefonoNuevo && persona.telefono && r.participante.telefono !== persona.telefono) {
    await update("participantes", r.participante.id, { telefono: persona.telefono }, user, { accion: "actualizar teléfono (Marcando Huellas)" });
  }
  return r.participante;
}

const contar = (animales: { especie: string }[]) => ({
  perros: animales.filter((x) => x.especie === "PERRO").length,
  gatos: animales.filter((x) => x.especie === "GATO").length,
});

export async function registrarAtencion(actividadId: string, input: AtencionInput, yo: Yo) {
  const { s } = await operativo(actividadId, yo);
  const dni = normalizeDni(input.dni);
  const existente = s.participantes.find((x) => x.dni === dni);
  const v = validar(input, !!existente?.telefono);
  return withLock(`atencion:${actividadId}`, async () => {
    const p = await guardarPersona(v.persona, !!cleanString(input.telefono, 40), yo.email);
    const at = await insert(
      "atenciones",
      { actividad_id: actividadId, participante_id: p.id, ...contar(v.animales), registrado: nowIso(), usuario: yo.email, activo: true, observaciones: v.observaciones },
      yo.email,
    );
    await insertMany("animales", v.animales.map((x) => ({ ...x, atencion_id: at.id, actividad_id: actividadId, activo: true })), yo.email, `atención ${at.id}`);
    return { id: at.id, nombre: `${p.nombre} ${p.apellido}`.trim(), ...contar(v.animales) };
  });
}

/** Corregir una atención mal cargada: actualiza la persona y reemplaza sus animales (los que sobran quedan inactivos). */
export async function editarAtencion(atencionId: string, input: AtencionInput, yo: Yo) {
  const s0 = await snapshot({ fresh: true });
  const at = s0.atenciones.find((x) => x.id === atencionId && x.activo);
  if (!at) throw new NotFoundError("La atención");
  const { s } = await operativo(at.actividad_id, yo);
  const existente = s.participantes.find((x) => x.dni === normalizeDni(input.dni));
  const v = validar(input, !!existente?.telefono);
  return withLock(`atencion:${at.actividad_id}`, async () => {
    const p = await guardarPersona(v.persona, !!cleanString(input.telefono, 40), yo.email);
    const actuales = (await readFresh("animales")).filter((x) => x.atencion_id === atencionId && x.activo).sort((x, y) => (x.especie === y.especie ? x.numero - y.numero : x.especie === "PERRO" ? -1 : 1));
    const patches: { id: string; patch: Partial<Animal> }[] = [];
    const nuevos: typeof v.animales = [];
    // Se reutilizan las filas existentes en orden; las que sobran se desactivan y las que faltan se agregan.
    v.animales.forEach((x, i) => {
      const fila = actuales[i];
      if (fila) patches.push({ id: fila.id, patch: { ...x } });
      else nuevos.push(x);
    });
    for (const fila of actuales.slice(v.animales.length)) patches.push({ id: fila.id, patch: { activo: false } });
    await updateMany("animales", patches, yo.email, "corregir animales");
    await insertMany("animales", nuevos.map((x) => ({ ...x, atencion_id: atencionId, actividad_id: at.actividad_id, activo: true })), yo.email);
    await update("atenciones", atencionId, { participante_id: p.id, ...contar(v.animales), observaciones: v.observaciones } as Partial<Atencion>, yo.email, { accion: "corregir atención" });
    return { id: atencionId, nombre: `${p.nombre} ${p.apellido}`.trim(), ...contar(v.animales) };
  });
}

/** Anular una atención cargada por error (no se borra: queda inactiva). */
export async function anularAtencion(atencionId: string, yo: Yo) {
  const s = await snapshot({ fresh: true });
  const at = s.atenciones.find((x) => x.id === atencionId);
  if (!at) throw new NotFoundError("La atención");
  await operativo(at.actividad_id, yo);
  await update("atenciones", atencionId, { activo: false }, yo.email, { accion: "anular atención" });
  const animales = s.animales.filter((x) => x.atencion_id === atencionId && x.activo).map((x) => ({ id: x.id, patch: { activo: false } }));
  await updateMany("animales", animales, yo.email, "anular animales");
}
