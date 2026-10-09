import { normalizeText, titleCase } from "./format";
import type { Actividad, MovimientoLogistica, Requerimiento } from "./schema";

/**
 * Logística de una actividad: qué se pidió, qué se entregó, qué volvió y qué falta.
 * Todo se calcula a partir de los requerimientos de la actividad y del historial de movimientos
 * (no hay un estado guardado aparte que se pueda desincronizar). Sirve en el servidor y en el navegador.
 */

export const ELEMENTOS_COMUNES = ["Banderas", "Gazebos", "Mesas", "Sillas", "Sonido / proyección", "Alargues", "Otros"] as const;

export const ESTADOS_LOGISTICA = ["Pendiente", "Preparando", "Entrega parcial", "Entregado", "Devolución parcial", "Con elementos pendientes", "Devuelto"] as const;
export type EstadoLogistica = (typeof ESTADOS_LOGISTICA)[number] | "Sin logística";

/**
 * De los «otros insumos», los que maneja Logística: tipo Equipamiento u Otro, o que por el nombre son elementos
 * que se prestan y vuelven (banderas, alargues…). Materiales, alimentos, impresiones, etc. se consumen: no se devuelven.
 */
const TIPOS_LOGISTICOS = ["equipamiento", "otro"];
const PALABRAS_LOGISTICAS = /bandera|alargue|zapatilla|gazebo|carpa|mesa|silla|parlante|sonido|micro|proyector|pantalla|banner|cartel|tablon|caballete/;

const clave = (s: string) => normalizeText(s).replace(/[^a-z0-9ñ ]/g, "").trim();

/** Elementos que la actividad pidió al cargarse (gazebos, mesas, sillas, sonido, luz y «otros insumos» de equipamiento). */
export function elementosSolicitados(
  a: Pick<Actividad, "gazebo" | "gazebo_cant" | "mesas" | "mesas_cant" | "sillas" | "sillas_cant" | "sonido" | "luz">,
  reqs: Pick<Requerimiento, "descripcion" | "tipo" | "cantidad" | "estado">[],
): { elemento: string; cantidad: number }[] {
  const out = new Map<string, { elemento: string; cantidad: number }>();
  const sumar = (elemento: string, cantidad: number) => {
    const k = clave(elemento);
    const prev = out.get(k);
    out.set(k, { elemento: prev?.elemento ?? elemento, cantidad: (prev?.cantidad ?? 0) + Math.max(1, cantidad || 0) });
  };
  if (a.gazebo) sumar("Gazebos", a.gazebo_cant);
  if (a.mesas) sumar("Mesas", a.mesas_cant);
  if (a.sillas) sumar("Sillas", a.sillas_cant);
  if (a.sonido) sumar("Sonido / proyección", 1);
  if (a.luz) sumar("Alargues", 1);
  for (const r of reqs) {
    if (r.estado === "ANULADO" || !r.descripcion) continue;
    if (!TIPOS_LOGISTICOS.includes(normalizeText(r.tipo)) && !PALABRAS_LOGISTICAS.test(normalizeText(r.descripcion))) continue;
    sumar(titleCase(r.descripcion), r.cantidad);
  }
  return [...out.values()];
}

export interface FilaLogistica {
  elemento: string;
  solicitado: number; // 0 = no se había pedido (se entregó igual). Incluye los pedidos de último momento.
  pedidoUltimoMomento: number; // de lo solicitado, cuánto se pidió a último momento (registrado por Logística)
  entregado: number;
  devuelto: number;
  porEntregar: number; // lo pedido que todavía no se entregó
  enCirculacion: number; // entregado y todavía no devuelto
  /** Quién recibió lo que sigue afuera (de las entregas de este elemento). */
  quienTiene: string[];
  ultimaEntrega: string; // fecha_hora
}

export interface ResumenLogistico {
  filas: FilaLogistica[];
  estado: EstadoLogistica;
  requiere: boolean; // pidió elementos o ya tuvo movimientos
  preparando: boolean;
  porEntregar: number;
  enCirculacion: number;
  entregado: number;
}

/** Fecha de la actividad ya pasó (o se cerró). */
const termino = (a: Pick<Actividad, "fecha" | "estado">, hoy: string) => a.estado === "REALIZADA" || (!!a.fecha && a.fecha < hoy);

export function resumenLogistico(
  a: Pick<Actividad, "id" | "fecha" | "estado" | "gazebo" | "gazebo_cant" | "mesas" | "mesas_cant" | "sillas" | "sillas_cant" | "sonido" | "luz">,
  reqs: Pick<Requerimiento, "actividad_id" | "descripcion" | "tipo" | "cantidad" | "estado">[],
  movimientos: MovimientoLogistica[],
  hoy: string,
): ResumenLogistico {
  const propios = movimientos.filter((m) => m.actividad_id === a.id && !m.anulado).sort((x, y) => x.fecha_hora.localeCompare(y.fecha_hora));
  const filas = new Map<string, FilaLogistica>();
  const fila = (elemento: string) => {
    const k = clave(elemento);
    let f = filas.get(k);
    if (!f) filas.set(k, (f = { elemento, solicitado: 0, pedidoUltimoMomento: 0, entregado: 0, devuelto: 0, porEntregar: 0, enCirculacion: 0, quienTiene: [], ultimaEntrega: "" }));
    return f;
  };
  for (const s of elementosSolicitados(a, reqs.filter((r) => r.actividad_id === a.id))) fila(s.elemento).solicitado += s.cantidad;
  for (const m of propios) {
    if (m.tipo === "PREPARACION" || !m.elemento) continue;
    const f = fila(m.elemento);
    if (m.tipo === "PEDIDO") {
      f.solicitado += m.cantidad;
      f.pedidoUltimoMomento += m.cantidad;
    } else if (m.tipo === "ENTREGA") {
      f.entregado += m.cantidad;
      f.ultimaEntrega = m.fecha_hora;
      if (m.persona && !f.quienTiene.includes(m.persona)) f.quienTiene.push(m.persona);
    } else f.devuelto += m.cantidad;
  }
  for (const f of filas.values()) {
    f.porEntregar = Math.max(0, f.solicitado - f.entregado);
    f.enCirculacion = Math.max(0, f.entregado - f.devuelto);
    if (!f.enCirculacion) f.quienTiene = [];
  }
  const lista = [...filas.values()];
  const entregado = lista.reduce((n, f) => n + f.entregado, 0);
  const devuelto = lista.reduce((n, f) => n + f.devuelto, 0);  const porEntregar = lista.reduce((n, f) => n + f.porEntregar, 0);
  const enCirculacion = lista.reduce((n, f) => n + f.enCirculacion, 0);
  const preparando = propios.some((m) => m.tipo === "PREPARACION");
  const requiere = lista.length > 0 || propios.length > 0;

  let estado: EstadoLogistica;
  if (!requiere) estado = "Sin logística";
  else if (!entregado) estado = preparando ? "Preparando" : "Pendiente";
  else if (enCirculacion && termino(a, hoy)) estado = "Con elementos pendientes"; // terminó y todavía falta que vuelva algo
  else if (devuelto) estado = enCirculacion ? "Devolución parcial" : "Devuelto";
  else estado = porEntregar ? "Entrega parcial" : "Entregado";

  return { filas: lista, estado, requiere, preparando, porEntregar, enCirculacion, entregado };
}

/** Colores suaves por estado (siempre acompañados del texto). */
export const COLOR_ESTADO: Record<EstadoLogistica, string> = {
  "Sin logística": "bg-fondo text-gris",
  Pendiente: "bg-[#eef1f5] text-[#4a5568]",
  Preparando: "bg-[#e6f0fb] text-[#1f5fa8]",
  "Entrega parcial": "bg-alerta-50 text-alerta",
  Entregado: "bg-verde-50 text-marca-600",
  "Devolución parcial": "bg-alerta-50 text-alerta",
  "Con elementos pendientes": "bg-[#fde8d7] text-[#a4410e]",
  Devuelto: "bg-marca text-white",
};

/** Ahora en Corrientes, como YYYY-MM-DDTHH:MM (para precargar los formularios). */
export function ahoraLocal(d = new Date()): string {
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  return p.replace(" ", "T");
}

/** «05/10 – 09:35». */
export function fechaHoraCorta(fh: string): string {
  const m = fh.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[3]}/${m[2]} – ${m[4]}` : fh;
}
