import type { Cumplimiento, Indicadores } from "./metricas";

/**
 * Resumen del mes para el Inicio: frases simples generadas con reglas fijas (sin IA)
 * a partir de los indicadores y el objetivo por zona.
 */

export type Tono = "logro" | "pendiente" | "alerta" | "info";

export interface Destacado {
  tono: Tono;
  texto: string;
  icono?: "sube" | "baja" | "personas" | "lugar"; // ícono distinto al del tono, cuando ayuda a leer
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
 * Comparación de un indicador entre dos períodos, en palabras.
 * `mejorSiSube`: true (más es mejor), false (más es peor: cancelaciones, costos) o null (neutro).
 */
export function compararIndicador(actual: number, anterior: number, mejorSiSube: boolean | null) {
  const diff = actual - anterior;
  const direccion: "sube" | "baja" | "igual" = diff > 0 ? "sube" : diff < 0 ? "baja" : "igual";
  const tono: "logro" | "pendiente" | "neutro" =
    direccion === "igual" || mejorSiSube === null ? "neutro" : (direccion === "sube") === mejorSiSube ? "logro" : "pendiente";
  return { diff, direccion, tono };
}

/**
 * Entre 2 y 4 conclusiones para Estadísticas, con reglas simples sobre los datos (sin IA).
 * Solo se dicen cosas que los datos permiten afirmar: si no hay datos suficientes, no se genera la frase.
 */
export function conclusionesEstadisticas(p: {
  ind: Indicadores;
  anterior: Indicadores | null; // período de comparación
  nombreAnterior: string; // «septiembre»
  zonas: (Pick<Cumplimiento, "cantidad" | "objetivo"> & { nombre: string })[];
  barrios: { label: string; value: number }[]; // actividades por barrio (sin «Sin dato»), de mayor a menor
  max?: number;
}): Destacado[] {
  const { ind, anterior, nombreAnterior, zonas, barrios } = p;
  const out: Destacado[] = [];
  if (ind.total === 0) return [{ tono: "pendiente", texto: "Todavía no hay actividades cargadas para este período." }];

  // 1) Objetivo por zona (hasta 2 frases).
  const pendientes = zonas.filter((z) => z.cantidad < z.objetivo).sort((a, b) => b.objetivo - b.cantidad - (a.objetivo - a.cantidad));
  for (const z of pendientes.slice(0, 1)) {
    const falta = z.objetivo - z.cantidad;
    out.push({ tono: "pendiente", texto: `${z.nombre} necesita ${plural(falta, "actividad más", "actividades más")} para alcanzar el objetivo.` });
  }
  const cumplidas = zonas.filter((z) => z.objetivo > 0 && z.cantidad >= z.objetivo);
  if (zonas.length > 1 && cumplidas.length === zonas.length) out.push({ tono: "logro", texto: "Todas las zonas alcanzaron el objetivo mensual." });
  else if (cumplidas.length) out.push({ tono: "logro", texto: `${cumplidas.map((z) => z.nombre).join(" y ")} ${cumplidas.length === 1 ? "ya alcanzó" : "ya alcanzaron"} el objetivo mensual.` });

  // 2) Comparación de actividades con el período anterior (solo si el anterior tiene datos).
  if (anterior && anterior.total > 0) {
    const c = compararIndicador(ind.programadas, anterior.programadas, true);
    if (c.direccion !== "igual") {
      out.push({ tono: "info", icono: c.direccion, texto: `Se programaron ${plural(Math.abs(c.diff), "actividad", "actividades")} ${c.direccion === "sube" ? "más" : "menos"} que en ${nombreAnterior}.` });
    } else out.push({ tono: "info", texto: `Se programaron las mismas actividades que en ${nombreAnterior}.` });
  }

  // 3) Suspensiones y cancelaciones.
  const bajas = ind.suspendidas + ind.canceladas;
  if (bajas > 0) out.push({ tono: bajas > Math.max(ind.realizadas, 1) ? "alerta" : "pendiente", texto: `${plural(bajas, "actividad se suspendió o canceló", "actividades se suspendieron o cancelaron")}.` });

  // 4) Personas nuevas y recurrentes (con al menos 5 personas para que el porcentaje diga algo).
  const personas = personasDelMes(ind);
  if (personas >= 5) {
    const pctNuevas = Math.round((ind.personasNuevas / personas) * 100);
    if (ind.personasRecurrentes > ind.personasNuevas) out.push({ tono: "info", icono: "personas", texto: `La mayoría de las personas ya habían participado antes (${100 - pctNuevas}% recurrentes).` });
    else out.push({ tono: "logro", icono: "personas", texto: `La mayoría de las personas participan por primera vez (${pctNuevas}% nuevas).` });
  }

  // 5) Dónde se concentra la actividad (con al menos 5 actividades con barrio).
  const totalBarrios = barrios.reduce((n, b) => n + b.value, 0);
  if (totalBarrios >= 5 && barrios.length) {
    const top = barrios[0];
    if (top.value / totalBarrios >= 0.3) out.push({ tono: "info", icono: "lugar", texto: `La actividad se concentra en ${top.label}: ${top.value} de ${totalBarrios} actividades.` });
    else if (barrios.length >= 3) out.push({ tono: "info", icono: "lugar", texto: `Las actividades se reparten en ${barrios.length} barrios distintos.` });
  }

  return out.slice(0, p.max ?? 4);
}

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
