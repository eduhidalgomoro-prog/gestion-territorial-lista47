import { normalizeText, phoneKey } from "./format";

/**
 * Ferias con cupo por grupos (ej. 35 originales + 20 del segundo grupo + 10 extra).
 * Las originales y las del segundo grupo están en listas cargadas de antemano; quien se inscribe
 * se reconoce por teléfono o por nombre. Quien no está en ninguna lista entra como extra.
 * Sin acceso a datos: sirve en el navegador y en el servidor.
 */

export const GRUPOS_FERIA = ["ORIGINAL", "ESPERA", "EXTRA"] as const;
export type GrupoFeria = (typeof GRUPOS_FERIA)[number];

export const GRUPO_LABEL: Record<GrupoFeria, string> = { ORIGINAL: "Originales", ESPERA: "Segundo grupo", EXTRA: "Extras" };
export const GRUPO_UNO: Record<GrupoFeria, string> = { ORIGINAL: "Original", ESPERA: "Segundo grupo", EXTRA: "Extra" };

export const esGrupo = (g: string): g is GrupoFeria => (GRUPOS_FERIA as readonly string[]).includes(g);

/** «ORIGINAL:35,ESPERA:20,EXTRA:10» → { ORIGINAL: 35, ESPERA: 20, EXTRA: 10 }. Vacío = feria sin grupos. */
export function parseCupos(valor: string): Partial<Record<GrupoFeria, number>> {
  const out: Partial<Record<GrupoFeria, number>> = {};
  for (const parte of (valor ?? "").split(",")) {
    const [g, n] = parte.split(":").map((x) => x.trim());
    if (esGrupo(g) && Number(n) >= 0) out[g] = Math.round(Number(n));
  }
  return out;
}

export const unirCupos = (c: Partial<Record<GrupoFeria, number>>) =>
  GRUPOS_FERIA.filter((g) => c[g] !== undefined).map((g) => `${g}:${c[g]}`).join(",");

export const conGrupos = (a: { cupos_grupos?: string }) => Object.keys(parseCupos(a.cupos_grupos ?? "")).length > 0;

/** Palabras del nombre que sirven para comparar (sin tildes, sin palabras cortas). */
const palabras = (s: string) => normalizeText(s).replace(/[^a-zñ ]/g, " ").split(/\s+/).filter((p) => p.length > 2);

/**
 * ¿Es la misma persona? Por teléfono (últimos 8 números) o por nombre: iguales, o todas las palabras
 * del nombre más corto están en el otro (al menos dos: «María López» = «María Inés López»).
 */
export function mismaPersona(a: { nombre: string; telefono: string }, b: { nombre: string; telefono: string }): boolean {
  const ta = phoneKey(a.telefono);
  if (ta && ta === phoneKey(b.telefono)) return true;
  const pa = palabras(a.nombre);
  const pb = palabras(b.nombre);
  if (!pa.length || !pb.length) return false;
  const [corto, largo] = pa.length <= pb.length ? [pa, new Set(pb)] : [pb, new Set(pa)];
  return corto.length >= 2 && corto.every((p) => largo.has(p));
}

/** En qué grupo entra: si está en la lista de originales, original; si no, segundo grupo; si no está en ninguna, extra. */
export function grupoDe(persona: { nombre: string; telefono: string }, lista: { grupo: string; nombre: string; telefono: string }[]): GrupoFeria {
  if (lista.some((l) => l.grupo === "ORIGINAL" && mismaPersona(persona, l))) return "ORIGINAL";
  if (lista.some((l) => l.grupo === "ESPERA" && mismaPersona(persona, l))) return "ESPERA";
  return "EXTRA";
}
