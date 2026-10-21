import "server-only";
import { Redis } from "@upstash/redis";
import { env } from "./env";

/**
 * Inscripción rápida a ferias: los lugares se reservan en Redis (al instante y sin pasarse del cupo)
 * y las inscripciones esperan en una cola hasta guardarse en la planilla en tandas.
 * Así un pico de 65 personas en un minuto no choca con el límite de escrituras de Google.
 * Sin Redis (desarrollo y pruebas) funciona igual, en la memoria del proceso.
 */

export type Reserva = "ok" | "ya" | "completo" | "init";
export type Espera = "espera" | "ya" | "ya_espera";

export interface Conteos {
  porGrupo: Record<string, number>;
  total: number;
  claves: string[]; // teléfonos / DNI de quienes ya tienen lugar (para no anotarlas dos veces)
  clavesEspera: string[]; // y de quienes ya están en la lista de espera
}

const PREFIJO = () => `gt47:${(env.spreadsheetId() || "local").slice(0, 10)}:feria`;
const k = (id: string, x: string) => `${PREFIJO()}:${id}:${x}`;
const DIAS_INIT = 3 * 86_400; // los contadores se rearman solos cada tanto (por si se tocó algo a mano)

const RESERVAR = `
if redis.call('exists', KEYS[1]) == 0 then return 'init' end
for i = 4, #ARGV do
  if redis.call('hexists', KEYS[4], ARGV[i]) == 1 then return 'ya' end
end
local g = tonumber(redis.call('get', KEYS[2]) or '0')
local t = tonumber(redis.call('get', KEYS[3]) or '0')
if tonumber(ARGV[1]) >= 0 and g >= tonumber(ARGV[1]) then return 'completo' end
if tonumber(ARGV[2]) > 0 and t >= tonumber(ARGV[2]) then return 'completo' end
redis.call('incr', KEYS[2])
redis.call('incr', KEYS[3])
for i = 4, #ARGV do redis.call('hset', KEYS[4], ARGV[i], '1') end
redis.call('rpush', KEYS[5], ARGV[3])
return 'ok'`;

// Lista de espera: no ocupa lugar; solo evita anotar dos veces a la misma persona.
const ESPERAR = `
for i = 2, #ARGV do
  if redis.call('hexists', KEYS[1], ARGV[i]) == 1 then return 'ya' end
end
for i = 2, #ARGV do
  if redis.call('hexists', KEYS[2], ARGV[i]) == 1 then return 'ya_espera' end
end
for i = 2, #ARGV do redis.call('hset', KEYS[2], ARGV[i], '1') end
redis.call('expire', KEYS[2], ${3 * 86_400})
redis.call('rpush', KEYS[3], ARGV[1])
return 'espera'`;

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = env.redisUrl();
  const token = env.redisToken();
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

// Versión en memoria (desarrollo, pruebas, o producción sin Redis): cada copia del servidor tiene la suya,
// así que se vuelve a leer la planilla seguido para ver lo que guardaron las otras.
const MEM_VIGENCIA_MS = 20_000;
const memInit = new Map<string, number>();
const mem = {
  init: {
    has: (id: string) => (memInit.get(id) ?? 0) > Date.now() - MEM_VIGENCIA_MS,
    add: (id: string) => void memInit.set(id, Date.now()),
    delete: (id: string) => void memInit.delete(id),
    clear: () => memInit.clear(),
  },
  cnt: new Map<string, number>(),
  quien: new Map<string, Set<string>>(),
  espera: new Map<string, Set<string>>(),
  cola: new Map<string, string[]>(),
};

/** Reserva un lugar (atómico): «ok» si entró, «ya» si esa persona ya tenía lugar, «completo» si no hay más lugar, «init» si hay que armar los contadores. */
export async function reservar(id: string, grupo: string, maxGrupo: number, maxTotal: number, claves: string[], payload: string): Promise<Reserva> {
  const r = getRedis();
  if (r) {
    return (await r.eval(RESERVAR, [k(id, "init"), k(id, `cnt:${grupo}`), k(id, "cnt:total"), k(id, "quien"), k(id, "cola")], [String(maxGrupo), String(maxTotal), payload, ...claves])) as Reserva;
  }
  if (!mem.init.has(id)) return "init";
  const quien = mem.quien.get(id) ?? new Set();
  if (claves.some((c) => quien.has(c))) return "ya";
  const g = mem.cnt.get(`${id}:${grupo}`) ?? 0;
  const t = mem.cnt.get(`${id}:total`) ?? 0;
  if ((maxGrupo >= 0 && g >= maxGrupo) || (maxTotal > 0 && t >= maxTotal)) return "completo";
  mem.cnt.set(`${id}:${grupo}`, g + 1);
  mem.cnt.set(`${id}:total`, t + 1);
  claves.forEach((c) => quien.add(c));
  mem.quien.set(id, quien);
  mem.cola.set(id, [...(mem.cola.get(id) ?? []), payload]);
  return "ok";
}

/** Anota en la lista de espera (cuando ya no hay lugar): «espera», o «ya» / «ya_espera» si esa persona ya tenía lugar o ya estaba esperando. */
export async function esperar(id: string, claves: string[], payload: string): Promise<Espera> {
  const r = getRedis();
  if (r) return (await r.eval(ESPERAR, [k(id, "quien"), k(id, "espera"), k(id, "cola")], [payload, ...claves])) as Espera;
  const quien = mem.quien.get(id) ?? new Set();
  if (claves.some((c) => quien.has(c))) return "ya";
  const espera = mem.espera.get(id) ?? new Set();
  if (claves.some((c) => espera.has(c))) return "ya_espera";
  claves.forEach((c) => espera.add(c));
  mem.espera.set(id, espera);
  mem.cola.set(id, [...(mem.cola.get(id) ?? []), payload]);
  return "espera";
}

/** ¿Los contadores ya están armados? (para que, si llegan muchas juntas, se armen una sola vez). */
export async function inicializada(id: string): Promise<boolean> {
  const r = getRedis();
  if (r) return (await r.exists(k(id, "init"))) === 1;
  return mem.init.has(id);
}

/** Arma los contadores con lo que ya está en la planilla + lo que espera en la cola. */
export async function inicializar(id: string, c: Conteos) {
  const r = getRedis();
  if (r) {
    const p = r.multi();
    p.del(k(id, "quien"));
    for (const [g, n] of Object.entries(c.porGrupo)) p.set(k(id, `cnt:${g}`), n, { ex: DIAS_INIT });
    p.set(k(id, "cnt:total"), c.total, { ex: DIAS_INIT });
    if (c.claves.length) p.hset(k(id, "quien"), Object.fromEntries(c.claves.map((x) => [x, "1"])));
    p.expire(k(id, "quien"), DIAS_INIT);
    p.del(k(id, "espera"));
    if (c.clavesEspera.length) p.hset(k(id, "espera"), Object.fromEntries(c.clavesEspera.map((x) => [x, "1"])));
    p.expire(k(id, "espera"), DIAS_INIT);
    p.set(k(id, "init"), "1", { ex: DIAS_INIT });
    await p.exec();
    return;
  }
  for (const key of [...mem.cnt.keys()]) if (key.startsWith(`${id}:`)) mem.cnt.delete(key);
  for (const [g, n] of Object.entries(c.porGrupo)) mem.cnt.set(`${id}:${g}`, n);
  mem.cnt.set(`${id}:total`, c.total);
  mem.quien.set(id, new Set(c.claves));
  mem.espera.set(id, new Set(c.clavesEspera));
  mem.init.add(id);
}

/** Algo cambió fuera de la inscripción rápida (bajas, grupos, cupos…): se rearman los contadores en la próxima. */
export async function invalidarContadores(id: string) {
  const r = getRedis();
  if (r) {
    await r.del(k(id, "init"));
    return;
  }
  mem.init.delete(id);
}

export async function verCola(id: string, n = 1000): Promise<string[]> {
  const r = getRedis();
  if (r) return ((await r.lrange(k(id, "cola"), 0, n - 1)) as unknown[]).map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
  return (mem.cola.get(id) ?? []).slice(0, n);
}

/** Saca de la cola las primeras `n` (ya guardadas en la planilla). */
export async function sacarDeCola(id: string, n: number) {
  if (n <= 0) return;
  const r = getRedis();
  if (r) {
    await r.ltrim(k(id, "cola"), n, -1);
    return;
  }
  mem.cola.set(id, (mem.cola.get(id) ?? []).slice(n));
}

export async function largoCola(id: string): Promise<number> {
  const r = getRedis();
  if (r) return r.llen(k(id, "cola"));
  return mem.cola.get(id)?.length ?? 0;
}

/** Solo para pruebas. */
export function reiniciarMemoria() {
  mem.init.clear();
  mem.cnt.clear();
  mem.quien.clear();
  mem.espera.clear();
  mem.cola.clear();
}
