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

/** Mínimo de clases para el certificado por defecto: el 75% (ej. 3 de 4), al menos 1. */
export const minimoPorDefecto = (clases: number) => Math.max(1, Math.ceil(clases * 0.75));

export interface FilaAsistenciaPersona {
  participante_id: string;
  porClase: ("PRESENTE" | "AUSENTE" | "")[]; // una por clase ("" = sin marcar)
  presentes: number;
}

/**
 * Asistencia de cada persona en cada clase (para los certificados): inscriptos y quien tenga alguna marca.
 * Si en una misma clase hay varias marcas de la persona, gana PRESENTE.
 */
export function asistenciaPorPersona(clases: number, inscriptos: string[], marcas: Marca[]): FilaAsistenciaPersona[] {
  const filas = new Map<string, FilaAsistenciaPersona>();
  const fila = (pid: string) => {
    let f = filas.get(pid);
    if (!f) filas.set(pid, (f = { participante_id: pid, porClase: Array(clases).fill(""), presentes: 0 }));
    return f;
  };
  for (const pid of inscriptos) fila(pid);
  for (const m of marcas) {
    const i = claseDeMarca(m) - 1;
    if (i < 0 || i >= clases || (m.estado !== "PRESENTE" && m.estado !== "AUSENTE")) continue;
    const f = fila(m.participante_id);
    if (m.estado === "PRESENTE" || !f.porClase[i]) f.porClase[i] = m.estado;
  }
  for (const f of filas.values()) f.presentes = f.porClase.filter((e) => e === "PRESENTE").length;
  return [...filas.values()];
}
