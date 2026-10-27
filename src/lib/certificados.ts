import { asistenciaPorPersona, fechasDeClases, minimoPorDefecto } from "./clases";
import type { Snapshot } from "./db";
import type { Actividad } from "./schema";

/**
 * Asistencia por persona en un taller de varias clases y quiénes cumplen el mínimo para el certificado.
 * Lo usan la página «Asistencia por persona» y la descarga en Excel (mismas filas).
 */
export interface FilaCertificado {
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  porClase: ("PRESENTE" | "AUSENTE" | "")[];
  presentes: number;
  cumple: boolean;
}

export function planillaCertificados(a: Actividad, s: Pick<Snapshot, "inscripciones" | "asistencias" | "participantes">, minimoPedido?: number) {
  const fechas = fechasDeClases(a);
  const minimo = Math.min(fechas.length, Math.max(1, Math.round(minimoPedido || minimoPorDefecto(fechas.length))));
  const inscriptos = s.inscripciones.filter((i) => i.actividad_id === a.id && i.estado === "INSCRIPTO").map((i) => i.participante_id);
  const personas = new Map(s.participantes.map((p) => [p.id, p]));
  const filas: FilaCertificado[] = asistenciaPorPersona(fechas.length, inscriptos, s.asistencias.filter((x) => x.actividad_id === a.id)).map((f) => {
    const p = personas.get(f.participante_id);
    return { nombre: p?.nombre ?? "", apellido: p?.apellido ?? "", dni: p?.dni ?? "", telefono: p?.telefono ?? "", porClase: f.porClase, presentes: f.presentes, cumple: f.presentes >= minimo };
  });
  // Primero quienes vinieron a más clases; después por apellido.
  filas.sort((x, y) => y.presentes - x.presentes || `${x.apellido} ${x.nombre}`.localeCompare(`${y.apellido} ${y.nombre}`));
  const clasesSinCargar = fechas.map((f, i) => ({ clase: i + 1, fecha: f })).filter((c) => !filas.some((f) => f.porClase[c.clase - 1]));
  return { fechas, minimo, filas, cumplen: filas.filter((f) => f.cumple).length, clasesSinCargar };
}
