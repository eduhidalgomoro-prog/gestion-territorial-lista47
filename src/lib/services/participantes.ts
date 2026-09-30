import "server-only";
import { insertMany, nextSeq, readFresh, updateMany } from "../db";
import { UserError } from "../errors";
import { withLock } from "../lock";
import type { OrigenInscripcion, Participante } from "../schema";
import { cleanString, normalizeBarrio, normalizeDni, normalizePhone, normalizeText, parseFechaNacimiento, phoneKey, titleCase, today } from "../util";

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

/** Nombres tal como la gente los escribe: sin puntos ni comas sueltos al final («Alegre.» → «Alegre»). */
function limpiarNombre(s: string): string {
  return titleCase(cleanString(s, 80).replace(/[.,;:]+$/g, "").trim());
}

/**
 * Valida los datos mínimos de una persona. Lanza UserError con el detalle por campo.
 * `dniOpcional`: se acepta sin DNI si hay teléfono (ej. listas viejas de Google Forms).
 */
export function limpiarPersona(
  p: PersonaInput,
  opts: { telefonoObligatorio?: boolean; barrioObligatorio?: boolean; dniOpcional?: boolean } = {},
): PersonaLimpia {
  const f: Record<string, string> = {};
  const nombre = limpiarNombre(p.nombre);
  const apellido = limpiarNombre(p.apellido);
  const dniCrudo = String(p.dni ?? "").trim();
  const dni = normalizeDni(dniCrudo);
  const telefono = normalizePhone(cleanString(p.telefono, 40));
  const barrio = normalizeBarrio(cleanString(p.barrio, 80));
  if (!nombre) f.nombre = "Falta el nombre.";
  if (!apellido) f.apellido = "Falta el apellido.";
  if (dniCrudo && !dni) f.dni = "El DNI no parece válido (solo números, 7 u 8 dígitos).";
  else if (!dni && !opts.dniOpcional) f.dni = "Falta el DNI.";
  else if (!dni && telefono.length < 8) f.dni = "Sin DNI hace falta al menos un teléfono.";
  if (opts.telefonoObligatorio && telefono.length < 8) f.telefono = "Poné un teléfono válido (con característica).";
  if (opts.barrioObligatorio && !barrio) f.barrio = "Indicá el barrio.";
  if (Object.keys(f).length) throw new UserError("Revisá los datos de la persona.", f);
  const direccion = cleanString(p.direccion ?? "", 200);
  const fecha_nacimiento = parseFechaNacimiento(p.fecha_nacimiento ?? "");
  return { nombre, apellido, dni, telefono, barrio, direccion, fecha_nacimiento };
}

/** Clave para reconocer a una persona dentro de un lote: DNI, o si no tiene, su teléfono. */
export function clavePersona(p: { dni: string; telefono: string; nombre?: string; apellido?: string }): string {
  if (p.dni) return `dni:${p.dni}`;
  const k = phoneKey(p.telefono);
  if (k) return `tel:${k}`;
  return `nom:${normalizeText(`${p.nombre ?? ""} ${p.apellido ?? ""}`)}`;
}

export interface UpsertResultado {
  participante: Participante;
  nuevo: boolean;
}

/**
 * Crea o recupera personas SIN duplicar (la base de participantes es única).
 * - Con DNI: se busca por DNI. Si no existe pero hay alguien SIN DNI con el mismo teléfono, es esa persona: se le completa el DNI.
 * - Sin DNI: se busca por teléfono.
 * - Si ya existe: solo se completan datos que estaban vacíos (nunca se pisan).
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
    const porDni = new Map(existentes.filter((p) => p.dni).map((p) => [p.dni, p]));
    const porTel = new Map<string, Participante>();
    const sinDniPorTel = new Map<string, Participante>();
    for (const p of existentes) {
      const k = phoneKey(p.telefono);
      if (!k) continue;
      if (!porTel.has(k)) porTel.set(k, p);
      if (!p.dni && !sinDniPorTel.has(k)) sinDniPorTel.set(k, p);
    }
    const buscar = (p: PersonaLimpia): Participante | undefined => {
      const k = phoneKey(p.telefono);
      if (p.dni) return porDni.get(p.dni) ?? (k ? sinDniPorTel.get(k) : undefined);
      return k ? porTel.get(k) : undefined;
    };
    const resultado: (UpsertResultado | { pendiente: PersonaLimpia; clave: string })[] = [];
    const completar = new Map<string, Partial<Participante>>();
    const nuevosPorClave = new Map<string, number>(); // la misma persona repetida dentro del lote
    for (const p of personas) {
      const ex = buscar(p);
      if (ex) {
        const patch: Partial<Participante> = {};
        if (!ex.dni && p.dni) patch.dni = p.dni;
        if (!ex.telefono && p.telefono) patch.telefono = p.telefono;
        if (!ex.barrio && p.barrio) patch.barrio = p.barrio;
        if (!ex.direccion && p.direccion) patch.direccion = p.direccion;
        if (!ex.fecha_nacimiento && p.fecha_nacimiento) patch.fecha_nacimiento = p.fecha_nacimiento;
        if (Object.keys(patch).length) {
          completar.set(ex.id, { ...completar.get(ex.id), ...patch });
          Object.assign(ex, patch);
          if (patch.dni) {
            porDni.set(patch.dni, ex);
            const k = phoneKey(ex.telefono);
            if (k) sinDniPorTel.delete(k);
          }
        }
        resultado.push({ participante: ex, nuevo: false });
        continue;
      }
      const clave = clavePersona(p);
      if (!nuevosPorClave.has(clave)) nuevosPorClave.set(clave, resultado.length);
      resultado.push({ pendiente: p, clave });
    }
    await updateMany("participantes", [...completar].map(([id, patch]) => ({ id, patch })), user, "completar datos");

    const claves = [...nuevosPorClave.keys()];
    const aCrear = claves.map((c) => (resultado[nuevosPorClave.get(c)!] as { pendiente: PersonaLimpia }).pendiente);
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
    const creadoPorClave = new Map(claves.map((c, i) => [c, creados[i]]));
    // El primero del lote es «nuevo»; si la misma persona vino repetida, las demás filas la recuperan.
    return resultado.map((r, idx) =>
      "participante" in r ? r : { participante: creadoPorClave.get(r.clave)!, nuevo: nuevosPorClave.get(r.clave) === idx },
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
