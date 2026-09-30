import { normalizeText, titleCase } from "./format";
import { ZONAS, ZONAS_ACTIVIDAD } from "./schema";

/**
 * Capital e interior.
 * - Capital: zonas fijas NORTE / ESTE / SUR (+ GENERAL = toda la ciudad), organizadas por barrios.
 * - Interior: regiones que define la coordinación en Configuración, cada una con sus localidades.
 * Las actividades y los usuarios guardan en «Zona» la zona de Capital o el nombre de la región.
 */

export type Ambito = "capital" | "interior";

export interface Region {
  nombre: string; // en mayúsculas, sin el prefijo «Región»
  localidades: string[];
}

export const esZonaCapital = (z: string) => (ZONAS_ACTIVIDAD as readonly string[]).includes(z);
/** Zonas de Capital con responsable (sin GENERAL). */
export const esZonaResponsableCapital = (z: string) => (ZONAS as readonly string[]).includes(z);

/** Una actividad sin zona se considera de Capital (vienen del formulario anterior). */
export const ambitoDe = (zona: string): Ambito => (!zona || esZonaCapital(zona) ? "capital" : "interior");

/** Actividad del interior en una localidad que no pertenece a ninguna región. */
export const SIN_REGION = "INTERIOR";

const RESERVADAS = [...ZONAS_ACTIVIDAD, "CAPITAL", SIN_REGION, "SIN"];

export function normalizarRegion(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/^regi[oó]n\s+/i, "").toUpperCase().slice(0, 60);
}

/** Lee la configuración: una línea por región, «Región = Localidad, Localidad…». */
export function parseRegiones(lineas: string[]): Region[] {
  const out: Region[] = [];
  for (const l of lineas) {
    const [nom, resto = ""] = l.split(/[=:]/, 2);
    const nombre = normalizarRegion(nom ?? "");
    if (!nombre || RESERVADAS.includes(nombre) || out.some((r) => r.nombre === nombre)) continue;
    const localidades = [...new Set(resto.split(/[,;]/).map((x) => nombrePropio(x)).filter(Boolean))];
    out.push({ nombre, localidades });
  }
  return out;
}

export function validarRegiones(lineas: string[]): string | null {
  for (const l of lineas) {
    const nombre = normalizarRegion(l.split(/[=:]/, 1)[0] ?? "");
    if (RESERVADAS.includes(nombre)) return `«${titleCase(nombre)}» es un nombre reservado para Capital. Usá otro nombre para la región.`;
  }
  const nombres = lineas.map((l) => normalizarRegion(l.split(/[=:]/, 1)[0] ?? "")).filter(Boolean);
  const rep = nombres.find((n, i) => nombres.indexOf(n) !== i);
  return rep ? `La región «${titleCase(rep)}» está repetida.` : null;
}

/** «PASO DE LOS LIBRES» → «Paso de los Libres» (conectores en minúscula, salvo al principio). */
export function nombrePropio(s: string): string {
  return titleCase(s).replace(/(?<=\s)(De|Del|La|Las|Los|Y)(?=\s)/g, (w) => w.toLowerCase());
}

export const regionLabel = (r: string) => (r === SIN_REGION ? "Interior (sin región)" : `Región ${nombrePropio(r)}`);

/** Busca una localidad en las regiones (sin importar mayúsculas ni tildes): su región y cómo está escrita en la lista. */
export function buscarLocalidad(regiones: Region[], localidad: string): { region: string; nombre: string } | null {
  const n = normalizeText(localidad);
  for (const r of regiones) {
    const l = r.localidades.find((x) => normalizeText(x) === n);
    if (n && l) return { region: r.nombre, nombre: l };
  }
  return null;
}

/**
 * Zonas válidas: las de Capital y las regiones configuradas.
 * Las actividades (conGeneral) también aceptan GENERAL y «interior sin región»; los usuarios no.
 */
export function zonaValida(z: string, regiones: Region[], conGeneral = true): boolean {
  if (conGeneral ? esZonaCapital(z) || z === SIN_REGION : esZonaResponsableCapital(z)) return true;
  return regiones.some((r) => r.nombre === z);
}
