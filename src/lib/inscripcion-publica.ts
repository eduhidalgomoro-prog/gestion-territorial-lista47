import { normalizeDni, normalizePhone, normalizeText, parseFechaNacimiento } from "./format";
import { PREGUNTAS_ESME, type Pregunta } from "./preguntas";
import type { SiNo } from "./schema";

/**
 * Formulario público de inscripción a talleres.
 * Las validaciones viven acá para que el navegador y el servidor digan exactamente lo mismo,
 * con mensajes en lenguaje simple (nada de «campo requerido»).
 */

export const CIUDAD_CAPITAL = "Corrientes";
export const OTRO = "__otro";

export interface DatosInscripcion {
  nombre: string;
  apellido: string;
  dni: string;
  ciudad: string;
  barrio: string;
  direccion: string;
  fecha_nacimiento: string; // DD/MM/AAAA, como la escribe la persona
  telefono: string;
  consentimiento: boolean;
}

export interface RespuestasEscuela {
  ex_alumna: SiNo | "";
  quiere_ser_profe: SiNo | "";
  ensenaria: string;
  conoce_espacio: SiNo | "";
  espacio: string;
}

export const esCapital = (ciudad: string) => normalizeText(ciudad) === normalizeText(CIUDAD_CAPITAL);

/** «15/08/1965» → «1965-08-15». Pide el año completo (4 cifras) para no confundir 1965 con 2065. */
export function fechaNacimientoPublica(s: string): string {
  const t = s.trim();
  if (!/^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(t)) return "";
  return parseFechaNacimiento(t);
}

/** Qué le falta a la fecha, dicho simple (el formulario la arma con tres casillas: día / mes / año). */
function errorFecha(s: string): string {
  const t = s.trim();
  if (!t.replace(/\//g, "")) return "Completá tu fecha de nacimiento.";
  const [dia = "", mes = "", anio = ""] = t.split(/[/.-]/).map((x) => x.trim());
  const faltan = [!dia && "el día", !mes && "el mes", !anio && "el año"].filter(Boolean) as string[];
  if (faltan.length) return `Te falta ${faltan.join(" y ")}.`;
  if (Number(dia) < 1 || Number(dia) > 31) return "Revisá el día: es un número del 1 al 31.";
  if (Number(mes) < 1 || Number(mes) > 12) return "Revisá el mes: es un número del 1 al 12. Por ejemplo, agosto es 8.";
  if (anio.length !== 4) return "Escribí el año completo, con 4 números. Por ejemplo 1965.";
  if (!fechaNacimientoPublica(t)) return "Revisá la fecha. Por ejemplo: 15 / 08 / 1965.";
  return "";
}

export function validarInscripcion(d: DatosInscripcion): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.nombre.trim()) e.nombre = "Nos falta tu nombre.";
  if (!d.apellido.trim()) e.apellido = "Nos falta tu apellido.";
  if (!d.dni.trim()) e.dni = "Nos falta tu DNI.";
  else if (!normalizeDni(d.dni) || /[^\d.\s-]/.test(d.dni)) e.dni = "Escribí tu DNI sin puntos, solo los números.";
  if (!d.ciudad.trim()) e.ciudad = "Elegí tu ciudad.";
  if (!d.barrio.trim()) e.barrio = esCapital(d.ciudad) || !d.ciudad.trim() ? "Elegí tu barrio." : "Escribí tu barrio.";
  if (!d.direccion.trim()) e.direccion = "Nos falta tu dirección.";
  const fecha = errorFecha(d.fecha_nacimiento);
  if (fecha) e.fecha_nacimiento = fecha;
  if (!d.telefono.trim()) e.telefono = "Nos falta tu número de WhatsApp.";
  else if (normalizePhone(d.telefono).length !== 10) e.telefono = "Revisá tu número de WhatsApp. Escribilo con la característica, por ejemplo 379 4123456.";
  if (!d.consentimiento) e.consentimiento = "Para inscribirte, marcá esta casilla.";
  return e;
}

/** Orden en que se revisan los campos (para llevar a la persona al primero con problema). */
export const ORDEN_CAMPOS = ["nombre", "apellido", "dni", "ciudad", "barrio", "direccion", "fecha_nacimiento", "telefono", "consentimiento"] as const;

/** Solo «SI» o «NO»; cualquier otra cosa = no respondió. */
export const siNo = (v: string): SiNo | "" => (v === "SI" || v === "NO" ? v : "");

/** Las respuestas abiertas solo cuentan si la respuesta Sí/No las habilita. */
export function limpiarEscuela(r: RespuestasEscuela, limpiar: (s: string) => string): RespuestasEscuela {
  const quiere_ser_profe = siNo(r.quiere_ser_profe);
  const conoce_espacio = siNo(r.conoce_espacio);
  return {
    ex_alumna: siNo(r.ex_alumna),
    quiere_ser_profe,
    ensenaria: quiere_ser_profe === "SI" ? limpiar(r.ensenaria) : "",
    conoce_espacio,
    espacio: conoce_espacio === "SI" ? limpiar(r.espacio) : "",
  };
}

/**
 * Talleres de la Escuela de Mujeres Emprendedoras: llevan los bloques «Queremos conocerte» y «Sumate a la escuela».
 * Se reconocen por el tipo (ESME, taller, capacitación), la mesa o las preguntas que ya tenían cargadas.
 * Ferias, Marcando Huellas, deportes, salud, etc. quedan con el formulario corto.
 */
export function esTallerEscuela(a: { tipo: string; mesa?: string; preguntas_extra?: string; es_feria?: boolean }): boolean {
  if (a.es_feria) return false;
  const tipo = normalizeText(a.tipo);
  if (tipo.includes("feria") || tipo.includes("marcando huellas")) return false;
  if (["esme", "taller", "capacitacion"].some((k) => tipo.includes(k))) return true;
  if (normalizeText(a.mesa ?? "").includes("esme")) return true;
  return normalizeText(a.preguntas_extra ?? "").includes("escuela de mujeres emprendedoras");
}

const ESME = new Set(PREGUNTAS_ESME.split("\n").map((l) => normalizeText(l.replace(/\s*\[[^\]]*\]\s*$/, ""))));

/** En los talleres de la Escuela, las preguntas ESME viejas ya están en el formulario: no se repiten. */
export function preguntasSinRepetir(preguntas: Pregunta[], escuela: boolean): { pregunta: Pregunta; indice: number }[] {
  return preguntas.map((pregunta, indice) => ({ pregunta, indice })).filter(({ pregunta }) => !escuela || !ESME.has(normalizeText(pregunta.texto)));
}
