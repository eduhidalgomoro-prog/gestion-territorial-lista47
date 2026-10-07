import "server-only";
import { insertMany, readFresh, snapshot, updateMany, NotFoundError } from "../db";
import { ForbiddenError, UserError } from "../errors";
import { withLock } from "../lock";
import { resumenLogistico, ahoraLocal } from "../logistica";
import { puede, type Yo } from "../permisos";
import { ESTADOS_ELEMENTO, type EstadoElemento, type TipoMovimiento } from "../schema";
import { cleanString, newId, titleCase, today } from "../util";

/**
 * Logística: preparación, entregas y devoluciones de elementos de una actividad.
 * Solo agrega registros (el historial nunca se borra); un error se corrige anulando el registro.
 * No modifica nada de la actividad ni de sus requerimientos.
 */

export interface ItemMovimiento {
  elemento: string;
  cantidad: number;
  estado?: string; // solo en devoluciones
}

export interface MovimientoInput {
  items: ItemMovimiento[];
  persona: string;
  fecha_hora: string; // YYYY-MM-DDTHH:MM
  observaciones: string;
}

async function actividadLogistica(actividadId: string, yo: Yo) {
  if (!puede.gestionarLogistica(yo)) throw new ForbiddenError("Solo Logística y la administración registran entregas y devoluciones.");
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === actividadId);
  if (!a) throw new NotFoundError("La actividad");
  return { a, s };
}

function fechaHoraValida(v: string): string {
  const s = cleanString(v, 16);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? s : ahoraLocal();
}

export async function registrarMovimiento(actividadId: string, tipo: Exclude<TipoMovimiento, "PREPARACION">, input: MovimientoInput, yo: Yo) {
  const { a, s } = await actividadLogistica(actividadId, yo);
  const persona = titleCase(cleanString(input.persona, 120));
  const f: Record<string, string> = {};
  if (!persona) f.persona = tipo === "ENTREGA" ? "Indicá quién recibe." : "Indicá quién devuelve.";
  // Junta el mismo elemento si vino repetido y descarta cantidades en cero.
  const items = new Map<string, { elemento: string; cantidad: number; estado: EstadoElemento | "" }>();
  for (const it of input.items ?? []) {
    const elemento = titleCase(cleanString(it.elemento, 80));
    const cantidad = Math.round(Number(it.cantidad) || 0);
    if (!elemento || cantidad <= 0) continue;
    if (cantidad > 999) throw new UserError(`Revisá la cantidad de ${elemento}.`);
    const estado = (ESTADOS_ELEMENTO as readonly string[]).includes(it.estado ?? "") ? (it.estado as EstadoElemento) : "";
    const k = elemento.toLowerCase();
    const prev = items.get(k);
    items.set(k, { elemento, cantidad: (prev?.cantidad ?? 0) + cantidad, estado: prev?.estado || estado });
  }
  if (!items.size) f.items = tipo === "ENTREGA" ? "Indicá al menos un elemento entregado." : "Indicá al menos un elemento devuelto.";
  if (Object.keys(f).length) throw new UserError("Revisá los datos marcados.", f);

  return withLock(`logistica:${actividadId}`, async () => {
    const movimientos = await readFresh("logistica");
    if (tipo === "DEVOLUCION") {
      // No se puede devolver más de lo que está afuera.
      const r = resumenLogistico(a, s.requerimientos, movimientos, today());
      for (const it of items.values()) {
        const fila = r.filas.find((x) => x.elemento.toLowerCase() === it.elemento.toLowerCase());
        const afuera = fila?.enCirculacion ?? 0;
        if (it.cantidad > afuera) throw new UserError(afuera ? `De ${it.elemento} quedan ${afuera} por devolver.` : `${it.elemento}: no hay nada entregado sin devolver.`);
      }
    }
    const lote = newId("LOTE");
    const fecha_hora = fechaHoraValida(input.fecha_hora);
    const observaciones = cleanString(input.observaciones, 500);
    const creados = await insertMany(
      "logistica",
      [...items.values()].map((it) => ({
        actividad_id: actividadId, lote, tipo, elemento: it.elemento, cantidad: it.cantidad, persona, fecha_hora,
        estado_elemento: tipo === "DEVOLUCION" ? it.estado : ("" as const), observaciones, usuario: yo.email, anulado: false,
      })),
      yo.email,
      tipo === "ENTREGA" ? "entrega de elementos" : "devolución de elementos",
    );
    return { lote, cantidad: creados.length };
  });
}

/** «Preparando»: se marca una vez (queda en el historial). */
export async function marcarPreparando(actividadId: string, yo: Yo) {
  await actividadLogistica(actividadId, yo);
  return withLock(`logistica:${actividadId}`, async () => {
    const movimientos = await readFresh("logistica");
    if (movimientos.some((m) => m.actividad_id === actividadId && m.tipo === "PREPARACION" && !m.anulado)) return { ya: true };
    await insertMany(
      "logistica",
      [{ actividad_id: actividadId, lote: newId("LOTE"), tipo: "PREPARACION" as const, elemento: "", cantidad: 0, persona: "", fecha_hora: ahoraLocal(), estado_elemento: "" as const, observaciones: "", usuario: yo.email, anulado: false }],
      yo.email,
      "preparando elementos",
    );
    return { ya: false };
  });
}

/** Anula un registro cargado por error (todo su lote). No se borra: queda tachado en el historial. */
export async function anularLote(actividadId: string, lote: string, yo: Yo) {
  await actividadLogistica(actividadId, yo);
  return withLock(`logistica:${actividadId}`, async () => {
    const movimientos = await readFresh("logistica");
    const delLote = movimientos.filter((m) => m.actividad_id === actividadId && m.lote === lote && !m.anulado);
    if (!delLote.length) throw new UserError("Ese registro ya no existe o ya estaba anulado.");
    // Anular una entrega no puede dejar devoluciones «de más».
    if (delLote[0].tipo === "ENTREGA") {
      const s = await snapshot();
      const a = s.actividades.find((x) => x.id === actividadId)!;
      const r = resumenLogistico(a, s.requerimientos, movimientos.map((m) => (m.lote === lote ? { ...m, anulado: true } : m)), today());
      const devueltoDeMas = r.filas.some((f) => f.devuelto > f.entregado);
      if (devueltoDeMas) throw new UserError("Esa entrega ya tiene devoluciones registradas: anulá primero la devolución.");
    }
    await updateMany("logistica", delLote.map((m) => ({ id: m.id, patch: { anulado: true } })), yo.email, "anular registro de logística");
    return { anulados: delLote.length };
  });
}
