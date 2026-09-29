import { normalizeText, pct } from "../format";
import { ESTADOS_QUE_CUENTAN, ZONAS, type Actividad, type Asistencia, type Inscripcion, type Participante } from "../schema";

/** Funciones puras de cálculo (sin acceso a datos): se pueden probar y reutilizar en cualquier pantalla. */

export interface Datos {
  actividades: Actividad[];
  inscripciones: Inscripcion[];
  asistencias: Asistencia[];
  participantes: Participante[];
}

export interface Filtros {
  anio?: number;
  mes?: number; // 0 o undefined = todo el año
  zona?: string;
  barrio?: string;
  responsable?: string;
  tipo?: string;
  estado?: string;
  q?: string;
}

export function filtrarActividades(acts: Actividad[], f: Filtros): Actividad[] {
  const q = normalizeText(f.q ?? "");
  return acts.filter((a) => {
    if (f.anio && a.anio !== f.anio) return false;
    if (f.mes && a.mes !== f.mes) return false;
    if (f.zona === "SIN" ? !!a.zona : f.zona && a.zona !== f.zona) return false;
    if (f.barrio && a.barrio !== f.barrio) return false;
    if (f.responsable && normalizeText(a.responsable) !== normalizeText(f.responsable)) return false;
    if (f.tipo && a.tipo !== f.tipo) return false;
    if (f.estado && a.estado !== f.estado) return false;
    if (q) {
      const hay = normalizeText([a.nombre, a.responsable, a.barrio, a.zona, a.tipo, a.id].join(" "));
      if (!q.split(" ").every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export const cuenta = (a: Actividad) => (ESTADOS_QUE_CUENTAN as readonly string[]).includes(a.estado);

/** Inscriptos, presentes y ausentes por actividad (calculados en vivo desde INSCRIPCIONES y ASISTENCIAS). */
export function conteosPorActividad(d: Pick<Datos, "inscripciones" | "asistencias">) {
  const out = new Map<string, { inscriptos: number; presentes: number; ausentes: number }>();
  const get = (id: string) => {
    let c = out.get(id);
    if (!c) out.set(id, (c = { inscriptos: 0, presentes: 0, ausentes: 0 }));
    return c;
  };
  const activos = new Set<string>();
  for (const i of d.inscripciones) {
    if (i.estado !== "INSCRIPTO") continue;
    get(i.actividad_id).inscriptos++;
    activos.add(`${i.actividad_id}|${i.participante_id}`);
  }
  for (const a of d.asistencias) {
    if (!activos.has(`${a.actividad_id}|${a.participante_id}`)) continue;
    if (a.estado === "PRESENTE") get(a.actividad_id).presentes++;
    else get(a.actividad_id).ausentes++;
  }
  return out;
}

export interface Indicadores {
  total: number;
  programadas: number;
  realizadas: number;
  suspendidas: number;
  canceladas: number;
  borradores: number;
  inscriptos: number;
  asistentes: number;
  pctAsistencia: number;
  personasNuevas: number;
  personasRecurrentes: number;
  costoEstimado: number;
  costoReal: number;
  costoPromedio: number;
}

/** Indicadores de un conjunto de actividades (normalmente, las de un mes). */
export function indicadores(acts: Actividad[], d: Datos, periodo?: { anio: number; mes?: number }): Indicadores {
  const conteos = conteosPorActividad(d);
  const ids = new Set(acts.map((a) => a.id));
  const realizadas = acts.filter((a) => a.estado === "REALIZADA");
  let inscriptos = 0;
  let asistentes = 0;
  let inscRealizadas = 0;
  let presRealizadas = 0;
  for (const a of acts) {
    const c = conteos.get(a.id);
    if (!c) continue;
    inscriptos += c.inscriptos;
    asistentes += c.presentes;
    if (a.estado === "REALIZADA") {
      inscRealizadas += c.inscriptos;
      presRealizadas += c.presentes;
    }
  }
  // Personas del período: inscriptas en alguna actividad no cancelada del período.
  const personas = new Set(
    d.inscripciones
      .filter((i) => i.estado === "INSCRIPTO" && ids.has(i.actividad_id))
      .filter((i) => {
        const a = acts.find((x) => x.id === i.actividad_id);
        return a && a.estado !== "CANCELADA" && a.estado !== "BORRADOR";
      })
      .map((i) => i.participante_id),
  );
  const prefijo = periodo ? (periodo.mes ? `${periodo.anio}-${String(periodo.mes).padStart(2, "0")}` : String(periodo.anio)) : "";
  const porId = new Map(d.participantes.map((p) => [p.id, p]));
  let nuevas = 0;
  for (const id of personas) {
    const p = porId.get(id);
    if (p && prefijo && p.fecha_primera.startsWith(prefijo)) nuevas++;
  }
  const activasCosto = acts.filter((a) => a.estado !== "CANCELADA" && a.estado !== "BORRADOR");
  const costoEstimado = activasCosto.reduce((s, a) => s + (a.costo_estimado || 0), 0);
  const costoReal = acts.reduce((s, a) => s + (a.costo_real || 0), 0);
  const conCosto = realizadas.filter((a) => a.costo_real > 0);
  return {
    total: acts.length,
    programadas: acts.filter(cuenta).length,
    realizadas: realizadas.length,
    suspendidas: acts.filter((a) => a.estado === "SUSPENDIDA").length,
    canceladas: acts.filter((a) => a.estado === "CANCELADA").length,
    borradores: acts.filter((a) => a.estado === "BORRADOR").length,
    inscriptos,
    asistentes,
    pctAsistencia: pct(presRealizadas, inscRealizadas),
    personasNuevas: nuevas,
    personasRecurrentes: personas.size - nuevas,
    costoEstimado,
    costoReal,
    costoPromedio: conCosto.length ? Math.round(conCosto.reduce((s, a) => s + a.costo_real, 0) / conCosto.length) : 0,
  };
}

export interface Cumplimiento {
  zona: string;
  cantidad: number;
  objetivo: number;
  ok: boolean;
}

/** Objetivo mensual por zona: indicador, nunca bloqueo. */
export function cumplimiento(acts: Actividad[], anio: number, mes: number, objetivo: number): Cumplimiento[] {
  return ZONAS.map((zona) => {
    const cantidad = acts.filter((a) => a.anio === anio && a.mes === mes && a.zona === zona && cuenta(a)).length;
    return { zona, cantidad, objetivo, ok: cantidad >= objetivo };
  });
}

export interface Barra {
  label: string;
  value: number;
  value2?: number;
}

export function agrupar(acts: Actividad[], key: (a: Actividad) => string, value: (a: Actividad) => number = () => 1, value2?: (a: Actividad) => number): Barra[] {
  const m = new Map<string, Barra>();
  for (const a of acts) {
    const k = key(a) || "Sin dato";
    const b = m.get(k) ?? { label: k, value: 0, value2: value2 ? 0 : undefined };
    b.value += value(a);
    if (value2) b.value2 = (b.value2 ?? 0) + value2(a);
    m.set(k, b);
  }
  return [...m.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function porZona(acts: Actividad[]): Barra[] {
  const base = agrupar(acts.filter((a) => a.estado !== "BORRADOR"), (a) => a.zona || "Sin zona");
  const orden = ["NORTE", "ESTE", "SUR", "GENERAL", "Sin zona"];
  return base.sort((a, b) => orden.indexOf(a.label) - orden.indexOf(b.label));
}

export function inscriptosVsAsistentes(acts: Actividad[], d: Datos): Barra[] {
  const c = conteosPorActividad(d);
  return porZona(acts).map((z) => {
    const deZona = acts.filter((a) => (a.zona || "Sin zona") === z.label && a.estado !== "BORRADOR");
    return {
      label: z.label,
      value: deZona.reduce((s, a) => s + (c.get(a.id)?.inscriptos ?? 0), 0),
      value2: deZona.reduce((s, a) => s + (c.get(a.id)?.presentes ?? 0), 0),
    };
  });
}

export interface PuntoEvolucion {
  anio: number;
  mes: number;
  actividades: number;
  realizadas: number;
  inscriptos: number;
  asistentes: number;
}

export function evolucion(d: Datos, hasta: { anio: number; mes: number }, meses = 6, zona?: string): PuntoEvolucion[] {
  const c = conteosPorActividad(d);
  const out: PuntoEvolucion[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const idx = hasta.anio * 12 + (hasta.mes - 1) - i;
    const anio = Math.floor(idx / 12);
    const mes = (idx % 12) + 1;
    const acts = d.actividades.filter((a) => a.anio === anio && a.mes === mes && (!zona || a.zona === zona));
    out.push({
      anio,
      mes,
      actividades: acts.filter(cuenta).length,
      realizadas: acts.filter((a) => a.estado === "REALIZADA").length,
      inscriptos: acts.reduce((s, a) => s + (c.get(a.id)?.inscriptos ?? 0), 0),
      asistentes: acts.reduce((s, a) => s + (c.get(a.id)?.presentes ?? 0), 0),
    });
  }
  return out;
}

/** Personas distintas que asistieron, agrupadas por zona de la actividad o por barrio de la persona. */
export function participantesPor(acts: Actividad[], d: Datos, por: "zona" | "barrio"): Barra[] {
  const ids = new Map(acts.map((a) => [a.id, a]));
  const porPersona = new Map(d.participantes.map((p) => [p.id, p]));
  const grupos = new Map<string, Set<string>>();
  for (const x of d.asistencias) {
    if (x.estado !== "PRESENTE") continue;
    const a = ids.get(x.actividad_id);
    if (!a) continue;
    const k = por === "zona" ? a.zona || "Sin zona" : porPersona.get(x.participante_id)?.barrio || "Sin barrio";
    if (!grupos.has(k)) grupos.set(k, new Set());
    grupos.get(k)!.add(x.participante_id);
  }
  return [...grupos].map(([label, s]) => ({ label, value: s.size })).sort((a, b) => b.value - a.value);
}

/** Variación entre dos valores, para comparar meses. */
export function variacion(actual: number, anterior: number): { diff: number; pct: number | null } {
  return { diff: actual - anterior, pct: anterior ? Math.round(((actual - anterior) / anterior) * 100) : null };
}
