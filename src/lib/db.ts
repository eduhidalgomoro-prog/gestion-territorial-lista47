import { revalidateTag, unstable_cache } from "next/cache";
import { withLock } from "./lock";
import {
  ENTITY_TABLES, TABLES, fromRow, header, toRow,
  type AuditoriaRow, type ConfigRow, type EntityMap, type EntityTable, type TableName, type ZonaBarrio,
} from "./schema";
import { getStore } from "./store";
import { newId, nowIso } from "./util";
import { parseConfig, type AppConfig } from "./config";

/**
 * Capa de acceso a datos. Todo lo que lee o escribe la planilla pasa por acá.
 * Para migrar a una base de datos real se reemplaza el "store" (src/lib/store), no este archivo.
 */

export interface Snapshot {
  actividades: EntityMap["actividades"][];
  participantes: EntityMap["participantes"][];
  inscripciones: EntityMap["inscripciones"][];
  asistencias: EntityMap["asistencias"][];
  requerimientos: EntityMap["requerimientos"][];
  usuarios: EntityMap["usuarios"][];
  asignaciones: EntityMap["asignaciones"][];
  instituciones: EntityMap["instituciones"][];
  feriantes: EntityMap["feriantes"][];
  puestos: EntityMap["puestos"][];
  atenciones: EntityMap["atenciones"][];
  animales: EntityMap["animales"][];
  barrios: ZonaBarrio[];
  config: AppConfig;
  leidoEn: number;
}

export class ConflictError extends Error {
  constructor() {
    super("Alguien modificó este registro mientras lo editabas. Recargá la página y volvé a intentarlo.");
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(what = "El registro") {
    super(`${what} no existe.`);
    this.name = "NotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Lectura con caché (velocidad y cuota de la API de Google)
//
// Dos niveles:
// 1. Memoria del servidor, unos segundos (varias lecturas dentro de un mismo pedido).
// 2. Copia compartida entre todos los servidores de Vercel (caché de datos de Next).
//    Cada vez que la app guarda algo se renueva en todos a la vez (invalidate → revalidateTag),
//    y además se refresca sola cada minuto por si alguien tocara la planilla a mano.
// Antes de escribir se sigue leyendo la planilla al momento (readFresh): nunca se guarda sobre datos viejos.
// ---------------------------------------------------------------------------
const CACHE_MS = 3_000;
const TAG = "datos";
const REVALIDAR_S = 60;
const MAX_BYTES = 1_800_000; // la caché de datos no guarda piezas de más de ~2 MB
const g = globalThis as unknown as { __gtSnap?: { at: number; p: Promise<Snapshot> }; __gtSinCompartida?: boolean };

export function invalidate() {
  g.__gtSnap = undefined;
  try {
    // Expira ya mismo (no «servir lo viejo mientras tanto»): quien guardó ve su cambio al instante.
    revalidateTag(TAG, { expire: 0 });
  } catch {
    // Fuera de Next (scripts, pruebas) no hay caché compartida: no hace falta.
  }
}

class DemasiadoGrande extends Error {}

const snapshotCompartido = unstable_cache(
  async () => {
    const s = await loadSnapshot();
    if (JSON.stringify(s).length > MAX_BYTES) throw new DemasiadoGrande(); // no se guarda: se lee directo
    return s;
  },
  ["snapshot-v1"],
  { tags: [TAG], revalidate: REVALIDAR_S },
);

async function cargar(): Promise<Snapshot> {
  if (g.__gtSinCompartida) return loadSnapshot();
  try {
    return await snapshotCompartido();
  } catch (e) {
    // Datos demasiado grandes para la copia compartida: de acá en más, lectura directa (como antes).
    if (e instanceof DemasiadoGrande) g.__gtSinCompartida = true;
    else if (!(e instanceof Error && /incrementalCache|static generation store|outside a request/i.test(e.message))) throw e;
    // Fuera de Next (scripts, pruebas): lectura directa.
    return loadSnapshot();
  }
}

function parseTable<T extends EntityTable>(t: T, rows: Record<string, string | number>[] | undefined): EntityMap[T][] {
  return (rows ?? []).map((r) => fromRow<EntityMap[T]>(t, r)).filter((e) => e.id);
}

async function loadSnapshot(): Promise<Snapshot> {
  const data = await getStore().read([...ENTITY_TABLES, "zonas_barrios", "config"]);
  return {
    actividades: parseTable("actividades", data.actividades),
    participantes: parseTable("participantes", data.participantes),
    inscripciones: parseTable("inscripciones", data.inscripciones),
    asistencias: parseTable("asistencias", data.asistencias),
    requerimientos: parseTable("requerimientos", data.requerimientos),
    usuarios: parseTable("usuarios", data.usuarios),
    asignaciones: parseTable("asignaciones", data.asignaciones),
    instituciones: parseTable("instituciones", data.instituciones),
    feriantes: parseTable("feriantes", data.feriantes),
    puestos: parseTable("puestos", data.puestos),
    atenciones: parseTable("atenciones", data.atenciones),
    animales: parseTable("animales", data.animales),
    barrios: (data.zonas_barrios ?? []).map((r) => fromRow<ZonaBarrio>("zonas_barrios", r)).filter((b) => b.barrio),
    config: parseConfig((data.config ?? []).map((r) => fromRow<ConfigRow>("config", r))),
    leidoEn: Date.now(),
  };
}

/** Todos los datos. Casi siempre salen de la copia compartida; `fresh` lee la planilla al momento. */
export async function snapshot(opts: { fresh?: boolean } = {}): Promise<Snapshot> {
  const now = Date.now();
  if (!opts.fresh && g.__gtSnap && now - g.__gtSnap.at < CACHE_MS) return g.__gtSnap.p;
  const p = opts.fresh ? loadSnapshot() : cargar();
  g.__gtSnap = { at: now, p };
  p.catch(() => invalidate());
  return p;
}

/** Lectura fresca (sin caché) de una tabla. Usar antes de escribir. */
export async function readFresh<T extends EntityTable>(table: T): Promise<EntityMap[T][]> {
  const data = await getStore().read([table]);
  return parseTable(table, data[table]);
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

type Auto = "id" | "creado" | "actualizado" | "actualizado_por" | "version";
export type NewEntity<T extends EntityTable> = Omit<EntityMap[T], Auto> & Partial<Pick<EntityMap[T], "id" | "creado">>;

export function buildEntity<T extends EntityTable>(table: T, data: NewEntity<T>, user: string): EntityMap[T] {
  const now = nowIso();
  return {
    ...data,
    id: data.id || newId(TABLES[table].prefix!),
    creado: data.creado || now,
    actualizado: now,
    actualizado_por: user,
    version: 1,
  } as EntityMap[T];
}

/**
 * IDs correlativos legibles: ACT-2026-0042, PAR-000123.
 * Se calculan leyendo los existentes; llamar SIEMPRE dentro de withLock(`seq:${table}`).
 */
export async function nextSeq(table: "actividades" | "participantes", count = 1, anio?: number): Promise<string[]> {
  const rows = await readFresh(table);
  if (table === "actividades") {
    const y = anio || new Date().getFullYear();
    const pre = `ACT-${y}-`;
    const max = rows.reduce((m, r) => (r.id.startsWith(pre) ? Math.max(m, Number(r.id.slice(pre.length)) || 0) : m), 0);
    return Array.from({ length: count }, (_, i) => `${pre}${String(max + i + 1).padStart(4, "0")}`);
  }
  const max = rows.reduce((m, r) => (r.id.startsWith("PAR-") ? Math.max(m, Number(r.id.slice(4)) || 0) : m), 0);
  return Array.from({ length: count }, (_, i) => `PAR-${String(max + i + 1).padStart(6, "0")}`);
}

export async function insert<T extends EntityTable>(table: T, data: NewEntity<T>, user: string): Promise<EntityMap[T]> {
  const entity = buildEntity(table, data, user);
  await getStore().append(table, [toRow(table, entity)]);
  invalidate();
  await log(user, "crear", table, entity.id);
  return entity;
}

export async function insertMany<T extends EntityTable>(table: T, list: NewEntity<T>[], user: string, detalle = ""): Promise<EntityMap[T][]> {
  if (!list.length) return [];
  const entities = list.map((d) => buildEntity(table, d, user));
  await getStore().append(table, entities.map((e) => toRow(table, e)));
  invalidate();
  await log(user, "crear", table, entities.length > 5 ? `${entities.length} registros` : entities.map((e) => e.id).join(","), detalle);
  return entities;
}

/**
 * Actualiza un registro con control de concurrencia optimista:
 * si se pasa `expectedVersion` y la fila cambió desde entonces, falla con ConflictError.
 */
export async function update<T extends EntityTable>(
  table: T,
  id: string,
  patch: Partial<EntityMap[T]> | ((current: EntityMap[T]) => Partial<EntityMap[T]>),
  user: string,
  opts: { expectedVersion?: number; lock?: boolean; accion?: string } = {},
): Promise<EntityMap[T]> {
  const run = async () => {
    const rows = await readFresh(table);
    const current = rows.find((r) => r.id === id);
    if (!current) throw new NotFoundError();
    if (opts.expectedVersion !== undefined && opts.expectedVersion > 0 && current.version !== opts.expectedVersion) {
      throw new ConflictError();
    }
    const changes = typeof patch === "function" ? patch(current) : patch;
    const next = {
      ...current,
      ...changes,
      id: current.id,
      creado: current.creado,
      version: (current.version || 0) + 1,
      actualizado: nowIso(),
      actualizado_por: user,
    } as EntityMap[T];
    await getStore().update(table, header(table, "id"), id, toRow(table, next));
    invalidate();
    const changed = Object.keys(changes).filter((k) => k !== "version").join(",");
    await log(user, opts.accion ?? "editar", table, id, changed);
    return next;
  };
  return opts.lock === false ? run() : withLock(`row:${table}:${id}`, run);
}

/** Actualiza varias filas de la misma tabla en una sola escritura (ej. asistencia masiva). */
export async function updateMany<T extends EntityTable>(
  table: T,
  patches: { id: string; patch: Partial<EntityMap[T]> }[],
  user: string,
  accion = "editar",
): Promise<void> {
  if (!patches.length) return;
  const rows = await readFresh(table);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const now = nowIso();
  const out = patches.map(({ id, patch }) => {
    const current = byId.get(id);
    if (!current) throw new NotFoundError();
    return toRow(table, { ...current, ...patch, id, creado: current.creado, version: (current.version || 0) + 1, actualizado: now, actualizado_por: user });
  });
  await getStore().updateMany(table, header(table, "id"), out);
  invalidate();
  await log(user, accion, table, patches.length > 5 ? `${patches.length} registros` : patches.map((p) => p.id).join(","));
}

// ---------------------------------------------------------------------------
// Tablas simples: barrios y configuración
// ---------------------------------------------------------------------------

export async function upsertBarrio(b: ZonaBarrio, user: string) {
  const store = getStore();
  await withLock("barrios", async () => {
    const data = await store.read(["zonas_barrios"]);
    const exists = (data.zonas_barrios ?? []).some((r) => String(r[header("zonas_barrios", "barrio")]).trim().toUpperCase() === b.barrio);
    const row = toRow("zonas_barrios", b);
    if (exists) await store.update("zonas_barrios", header("zonas_barrios", "barrio"), b.barrio, row);
    else await store.append("zonas_barrios", [row]);
  });
  invalidate();
  await log(user, "configurar", "zonas_barrios", b.barrio, `${b.zona} ${b.activo ? "activo" : "inactivo"}`);
}

export async function setConfigValue(clave: string, valor: string, descripcion: string, user: string) {
  const store = getStore();
  await withLock("config", async () => {
    const data = await store.read(["config"]);
    const exists = (data.config ?? []).some((r) => String(r[header("config", "clave")]) === clave);
    const row = toRow("config", { clave, valor, descripcion });
    if (exists) await store.update("config", header("config", "clave"), clave, row);
    else await store.append("config", [row]);
  });
  invalidate();
  await log(user, "configurar", "config", clave);
}

// ---------------------------------------------------------------------------
// Auditoría: quién hizo cada cambio importante
// ---------------------------------------------------------------------------
export async function log(usuario: string, accion: string, entidad: TableName | string, ref_id: string, detalle = "") {
  try {
    const row: AuditoriaRow = { fecha: nowIso(), usuario, accion, entidad, ref_id, detalle: detalle.slice(0, 500) };
    await getStore().append("auditoria", [toRow("auditoria", row)]);
  } catch (err) {
    // El registro de auditoría nunca debe impedir la operación principal.
    console.error("[auditoria] no se pudo guardar", err);
  }
}
