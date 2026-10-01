import type { Cumplimiento, Indicadores } from "./metricas";

/**
 * Resumen del mes para el Inicio: frases simples generadas con reglas fijas (sin IA)
 * a partir de los indicadores y el objetivo por zona.
 */

export type Tono = "logro" | "pendiente" | "alerta" | "info";

export interface Destacado {
  tono: Tono;
  texto: string;
}

/** Estado de una zona respecto del objetivo, en palabras. */
export function estadoZona(c: Pick<Cumplimiento, "cantidad" | "objetivo">): { tono: "logro" | "pendiente"; texto: string } {
  if (c.cantidad > c.objetivo) return { tono: "logro", texto: "Objetivo superado" };
  if (c.cantidad >= c.objetivo) return { tono: "logro", texto: "Objetivo cumplido" };
  return { tono: "pendiente", texto: `Falta ${c.objetivo - c.cantidad}` };
}

/** Personas distintas alcanzadas en el período (inscriptas en actividades no canceladas). */
export const personasDelMes = (ind: Pick<Indicadores, "personasNuevas" | "personasRecurrentes">) => ind.personasNuevas + ind.personasRecurrentes;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * 2 o 3 mensajes con lo más importante del mes, por prioridad:
 * 1) zonas que todavía no llegan al objetivo · 2) zonas que lo superaron o lo cumplieron
 * 3) suspensiones/cancelaciones · 4) personas nuevas · 5) personas alcanzadas.
 */
export function destacadosDelMes(
  ind: Indicadores,
  zonas: (Pick<Cumplimiento, "cantidad" | "objetivo"> & { nombre: string })[],
  nombreMes: string,
  max = 3,
): Destacado[] {
  const out: Destacado[] = [];
  const mes = nombreMes.toLowerCase();
  const personas = personasDelMes(ind);

  if (ind.total === 0) {
    return [{ tono: "pendiente", texto: `Todavía no hay actividades cargadas para ${mes}.` }];
  }

  const pendientes = zonas.filter((z) => z.cantidad < z.objetivo).sort((a, b) => b.objetivo - b.cantidad - (a.objetivo - a.cantidad));
  for (const z of pendientes.slice(0, 2)) {
    const falta = z.objetivo - z.cantidad;
    out.push({ tono: "pendiente", texto: `${z.nombre} necesita ${plural(falta, "actividad más", "actividades más")} para cumplir el objetivo.` });
  }

  const superadas = zonas.filter((z) => z.objetivo > 0 && z.cantidad > z.objetivo);
  if (zonas.length > 1 && pendientes.length === 0) out.push({ tono: "logro", texto: "Todas las zonas cumplieron el objetivo mensual." });
  else if (superadas.length === 1) out.push({ tono: "logro", texto: `${superadas[0].nombre} ya superó su objetivo mensual.` });
  else if (superadas.length > 1) out.push({ tono: "logro", texto: `${superadas.map((z) => z.nombre).join(" y ")} ya superaron su objetivo mensual.` });
  else if (zonas.length === 1 && pendientes.length === 0) out.push({ tono: "logro", texto: "Tu zona ya cumplió el objetivo mensual." });

  const bajas = ind.suspendidas + ind.canceladas;
  if (bajas > 0) {
    // Alerta real solo si se cayeron más actividades de las que se hicieron.
    out.push({ tono: bajas > Math.max(ind.realizadas, 1) ? "alerta" : "pendiente", texto: `${plural(bajas, "actividad se suspendió o canceló", "actividades se suspendieron o cancelaron")} este mes.` });
  }

  if (ind.personasNuevas > 0) out.push({ tono: "logro", texto: `${plural(ind.personasNuevas, "persona participa", "personas participan")} por primera vez.` });

  if (personas > 0) out.push({ tono: "info", texto: `${plural(personas, "persona está inscripta", "personas están inscriptas")} en actividades de ${mes}.` });

  return out.slice(0, max);
}
