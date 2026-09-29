import "server-only";
import { insertMany, nextSeq, readFresh, updateMany } from "../db";
import { UserError } from "../errors";
import { withLock } from "../lock";
import type { OrigenInscripcion, Participante } from "../schema";
import { cleanString, normalizeBarrio, normalizeDni, normalizePhone, parseFechaNacimiento, phoneKey, titleCase, today } from "../util";

export interface PersonaInput {
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  barrio: string;
  direccion?: string;
  fecha_nacimiento?: string;
}

export interface PersonaLimpia {
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  barrio: string;
  direccion: string;
  fecha_nacimiento: string;
}

/** Valida los datos mínimos de una persona. Lanza UserError con el detalle por campo. */
export function limpiarPersona(p: PersonaInput, opts: { telefonoObligatorio?: boolean; barrioObligatorio?: boolean } = {}): PersonaLimpia {
  const f: Record<string, string> = {};
  const nombre = titleCase(cleanString(p.nombre, 80));
  const apellido = titleCase(cleanString(p.apellido, 80));
  const dni = normalizeDni(p.dni);
  const telefono = normalizePhone(cleanString(p.telefono, 40));
  const barrio = normalizeBarrio(cleanString(p.barrio, 80));
  if (!nombre) f.nombre = "Falta el nombre.";
  if (!apellido) f.apellido = "Falta el apellido.";
  if (!dni) f.dni = p.dni ? "El DNI no parece válido (solo números, 7 u 8 dígitos)." : "Falta el DNI.";
  if (opts.telefonoObligatorio && telefono.length < 8) f.telefono = "Poné un teléfono válido (con característica).";
  if (opts.barrioObligatorio && !barrio) f.barrio = "Indicá el barrio.";
  if (Object.keys(f).length) throw new UserError("Revisá los datos de la persona.", f);
  const direccion = cleanString(p.direccion ?? "", 200);
  const fecha_nacimiento = parseFechaNacimiento(p.fecha_nacimiento ?? "");
  return { nombre, apellido, dni, telefono, barrio, direccion, fecha_nacimiento };
}

export interface UpsertResultado {
  participante: Participante;
  nuevo: boolean;
}

/**
 * Crea o recupera personas por DNI, SIN duplicar (la base de participantes es única).
 * - Si el DNI ya existe: se recupera y solo se completan datos que estaban vacíos (nunca se pisan).
 * - Si el teléfono coincide con otra persona de distinto DNI: se marca «Posible duplicado de» para revisar.
 * Todo dentro de un bloqueo, así dos inscripciones simultáneas no crean la misma persona dos veces.
 */
export async function upsertParticipantes(
  personas: PersonaLimpia[],
  origen: OrigenInscripcion,
  user: string,
  extra: { consentimiento?: string; fecha?: string } = {},
): Promise<UpsertResultado[]> {
  return withLock("participantes", async () => {
    const existentes = await readFresh("participantes");
    const porDni = new Map(existentes.map((p) => [p.dni, p]));
    const porTel = new Map<string, Participante>();
    for (const p of existentes) {
      const k = phoneKey(p.telefono);
      if (k && !porTel.has(k)) porTel.set(k, p);
    }
    const resultado: (UpsertResultado | { pendiente: PersonaLimpia })[] = [];
    const completar = new Map<string, Partial<Participante>>();
    const nuevosPorDni = new Map<string, number>(); // DNI repetido dentro del mismo lote
    for (const p of personas) {
      const ex = porDni.get(p.dni);
      if (ex) {
        const patch: Partial<Participante> = {};
        if (!ex.telefono && p.telefono) patch.telefono = p.telefono;
        if (!ex.barrio && p.barrio) patch.barrio = p.barrio;
        if (!ex.direccion && p.direccion) patch.direccion = p.direccion;
        if (!ex.fecha_nacimiento && p.fecha_nacimiento) patch.fecha_nacimiento = p.fecha_nacimiento;
        if (Object.keys(patch).length) {
          completar.set(ex.id, { ...completar.get(ex.id), ...patch });
          Object.assign(ex, patch);
        }
        resultado.push({ participante: ex, nuevo: false });
      } else if (nuevosPorDni.has(p.dni)) {
        resultado.push({ pendiente: p });
      } else {
        nuevosPorDni.set(p.dni, resultado.length);
        resultado.push({ pendiente: p });
      }
    }
    await updateMany("participantes", [...completar].map(([id, patch]) => ({ id, patch })), user, "completar datos");

    const aCrear = [...nuevosPorDni.keys()].map((dni) => (resultado[nuevosPorDni.get(dni)!] as { pendiente: PersonaLimpia }).pendiente);
    const ids = aCrear.length ? await nextSeq("participantes", aCrear.length) : [];
    const fecha = extra.fecha || today();
    const creados = await insertMany(
      "participantes",
      aCrear.map((p, i) => {
        const k = phoneKey(p.telefono);
        const dup = k ? porTel.get(k) : undefined;
        // También cuenta si el teléfono se repite entre personas nuevas del mismo lote.
        if (k && !dup) porTel.set(k, { id: ids[i], dni: p.dni } as Participante);
        return {
          id: ids[i],
          ...p,
          fecha_primera: fecha,
          origen,
          consentimiento: extra.consentimiento ?? "",
          posible_duplicado_de: dup && dup.dni !== p.dni ? dup.id : "",
        };
      }),
      user,
      origen,
    );
    const creadoPorDni = new Map(creados.map((c) => [c.dni, c]));
    // El primero del lote es «nuevo»; si el mismo DNI vino repetido, las demás filas lo recuperan.
    return resultado.map((r, idx) =>
      "participante" in r ? r : { participante: creadoPorDni.get(r.pendiente.dni)!, nuevo: nuevosPorDni.get(r.pendiente.dni) === idx },
    );
  });
}

/** Actualiza la fecha de primera inscripción si llega una inscripción más antigua (importaciones históricas). */
export async function ajustarPrimeraFecha(ids: string[], fecha: string, user: string) {
  if (!ids.length || !fecha) return;
  const ps = await readFresh("participantes");
  const patches = ps.filter((p) => ids.includes(p.id) && (!p.fecha_primera || p.fecha_primera > fecha)).map((p) => ({ id: p.id, patch: { fecha_primera: fecha } }));
  await updateMany("participantes", patches, user, "ajustar primera inscripción");
}
