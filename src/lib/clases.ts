/**
 * Talleres de varias clases (ej. 4 viernes). Sirve en el servidor y en el navegador.
 * - La actividad guarda las fechas en «Fechas de clases» (separadas por coma). Vacío = una sola clase (la fecha programada).
 * - Cada marca de asistencia guarda su «Clase» (1, 2, 3…). Las marcas viejas no tienen número: son de la clase 1.
 * - Para los números de la actividad, cada persona cuenta una vez: presente si vino a alguna clase.
 */

export function fechasDeClases(a: { fecha: string; fechas_clases?: string }): string[] {
  const lista = (a.fechas_clases ?? "")
    .split(/[,;\s]+/)
    .map((f) => f.trim())
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f));
  const todas = [...new Set([a.fecha, ...lista].filter(Boolean))].sort();
  return todas.length ? todas : [""];
}

export const cantidadClases = (a: { fecha: string; fechas_clases?: string }) => fechasDeClases(a).length;

/** Número de clase de una marca (las viejas, sin número, son de la clase 1). */
export const claseDeMarca = (m: { clase?: number }) => (m.clase && m.clase > 0 ? m.clase : 1);

/** La clase para tomar asistencia hoy: la de hoy; si no hay, la próxima; si ya pasaron todas, la última. */
export function claseActual(fechas: string[], hoy: string): number {
  const deHoy = fechas.indexOf(hoy);
  if (deHoy >= 0) return deHoy + 1;
  const proxima = fechas.findIndex((f) => f && f > hoy);
  if (proxima > 0) return proxima; // la última que ya pasó (todavía se puede estar cargando)
  if (proxima === 0) return 1;
  return fechas.length;
}

type Marca = { participante_id: string; estado: string; clase?: number };

/**
 * Estado de cada persona en la actividad: PRESENTE si vino a alguna clase; AUSENTE si solo tiene ausencias.
 * Con una sola clase es exactamente su marca, como siempre.
 */
export function estadoPorPersona(marcas: Marca[]): Map<string, "PRESENTE" | "AUSENTE"> {
  const out = new Map<string, "PRESENTE" | "AUSENTE">();
  for (const m of marcas) {
    if (m.estado === "PRESENTE") out.set(m.participante_id, "PRESENTE");
    else if (m.estado === "AUSENTE" && !out.has(m.participante_id)) out.set(m.participante_id, "AUSENTE");
  }
  return out;
}
