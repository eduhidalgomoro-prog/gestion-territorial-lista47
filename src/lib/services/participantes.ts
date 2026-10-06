import "server-only";
import { insertMany, nextSeq, readFresh, updateMany } from "../db";
import { UserError } from "../errors";
import { withLock } from "../lock";
import type { OrigenInscripcion, Participante } from "../schema";
import { nombrePropio } from "../territorio";
import { cleanString, normalizeBarrio, normalizeDni, normalizePhone, normalizeText, parseFechaNacimiento, phoneKey, titleCase, today } from "../util";

export interface PersonaInput {
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  ciudad?: string;
  barrio: string;
  direccion?: string;
  fecha_nacimiento?: string;
}

export interface PersonaLimpia {
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  ciudad: string;
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
 * `dniOpcional`: se acepta sin DNI (ej. listas de Google Forms o de un operativo): alcanza con nombre y apellido.
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
  if (opts.telefonoObligatorio && telefono.length < 8) f.telefono = "Poné un teléfono válido (con característica).";
  if (opts.barrioObligatorio && !barrio) f.barrio = "Indicá el barrio.";
  if (Object.keys(f).length) throw new UserError("Revisá los datos de la persona.", f);
  const direccion = cleanString(p.direccion ?? "", 200);
  const fecha_nacimiento = parseFechaNacimiento(p.fecha_nacimiento ?? "");
  const ciudad = nombrePropio(cleanString(p.ciudad ?? "", 80));
  return { nombre, apellido, dni, telefono, ciudad, barrio, direccion, fecha_nacimiento };
}

/**
 * Nombre para comparar personas sin DNI: primer apellido + primer nombre, sin tildes ni mayúsculas.
 * («Laura Liliana Alegre» y «Laura Alegre» son la misma; «Victoria Cardozo» y «Guadalupe Cardozo», no.)
 */
export function nombreClave(p: { nombre?: string; apellido?: string }): string {
  const primero = (s: string) => normalizeText(s).replace(/[^a-zñ ]/g, " ").trim().split(/\s+/)[0] ?? "";
  return `${primero(p.apellido ?? "")}|${primero(p.nombre ?? "")}`;
}

/**
 * Clave para reconocer a una persona dentro de un lote: DNI; sin DNI, teléfono + nombre
 * (familiares que comparten teléfono son personas distintas); sin nada, el nombre completo.
 */
export function clavePersona(p: { dni: string; telefono: string; nombre?: string; apellido?: string }): string {
  if (p.dni) return `dni:${p.dni}`;
  const k = phoneKey(p.telefono);
  if (k) return `tel:${k}:${nombreClave(p)}`;
  return `nom:${normalizeText(`${p.nombre ?? ""} ${p.apellido ?? ""}`)}`;
}

/**
 * Busca a una persona en la base sin duplicarla y sin confundir familiares:
 * - Con DNI: por DNI. Si no está, alguien SIN DNI con el mismo teléfono y el mismo nombre (se le completa el DNI).
 * - Sin DNI: mismo teléfono y mismo nombre; sin teléfono, mismo nombre completo (de alguien sin DNI).
 * `mismoTelefono` devuelve a quienes ya usan ese teléfono (para marcar «posible duplicado»).
 */
export function crearBuscador(existentes: Participante[]) {
  const porDni = new Map(existentes.filter((p) => p.dni).map((p) => [p.dni, p]));
  const porTel = new Map<string, Participante[]>();
  const porNombre = new Map<string, Participante>();
  const agregar = (p: Participante) => {
    const k = phoneKey(p.telefono);
    if (k) porTel.set(k, [...(porTel.get(k) ?? []), p]);
    const n = normalizeText(`${p.nombre} ${p.apellido}`);
    if (!p.dni && n && !porNombre.has(n)) porNombre.set(n, p);
  };
  existentes.forEach(agregar);
  const buscar = (p: { dni: string; telefono: string; nombre: string; apellido: string }): Participante | undefined => {
    const k = phoneKey(p.telefono);
    const mismoNombre = (x: Participante) => nombreClave(x) === nombreClave(p);
    if (p.dni) return porDni.get(p.dni) ?? (k ? porTel.get(k)?.find((x) => !x.dni && mismoNombre(x)) : undefined);
    if (k) return porTel.get(k)?.find(mismoNombre);
    return porNombre.get(normalizeText(`${p.nombre} ${p.apellido}`));
  };
  return {
    buscar,
    mismoTelefono: (tel: string) => (phoneKey(tel) ? porTel.get(phoneKey(tel)) ?? [] : []),
    /** Para que las personas nuevas del mismo lote también cuenten. */
    agregar,
    asignarDni: (p: Participante) => porDni.set(p.dni, p),
  };
}

export interface UpsertResultado {
  participante: Participante;
  nuevo: boolean;
}

/**
 * Crea o recupera personas SIN duplicar (la base de participantes es única). Cómo se reconoce: ver crearBuscador.
 * - Si ya existe: solo se completan datos que estaban vacíos (nunca se pisan).
 * - Si el teléfono coincide con otra persona (otro DNI u otro nombre): se marca «Posible duplicado de» para revisar.
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
    const base = crearBuscador(existentes);
    const buscar = base.buscar;
    const resultado: (UpsertResultado | { pendiente: PersonaLimpia; clave: string })[] = [];
    const completar = new Map<string, Partial<Participante>>();
    const nuevosPorClave = new Map<string, number>(); // la misma persona repetida dentro del lote
    for (const p of personas) {
      const ex = buscar(p);
      if (ex) {
        const patch: Partial<Participante> = {};
        if (!ex.dni && p.dni) patch.dni = p.dni;
        if (!ex.telefono && p.telefono) patch.telefono = p.telefono;
        if (!ex.ciudad && p.ciudad) patch.ciudad = p.ciudad;
        if (!ex.barrio && p.barrio) patch.barrio = p.barrio;
        if (!ex.direccion && p.direccion) patch.direccion = p.direccion;
        if (!ex.fecha_nacimiento && p.fecha_nacimiento) patch.fecha_nacimiento = p.fecha_nacimiento;
        if (Object.keys(patch).length) {
          completar.set(ex.id, { ...completar.get(ex.id), ...patch });
          Object.assign(ex, patch);
          if (patch.dni) base.asignarDni(ex);
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
        // Mismo teléfono que otra persona (familiares, o la misma con otro dato): se crea igual y se marca para revisar.
        const dup = base.mismoTelefono(p.telefono).find((x) => x.dni !== p.dni || !p.dni);
        // También cuenta si el teléfono se repite entre personas nuevas del mismo lote.
        base.agregar({ ...p, id: ids[i] } as Participante);
        return {
          id: ids[i],
          ...p,
          fecha_primera: fecha,
          origen,
          consentimiento: extra.consentimiento ?? "",
          posible_duplicado_de: dup ? dup.id : "",
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
