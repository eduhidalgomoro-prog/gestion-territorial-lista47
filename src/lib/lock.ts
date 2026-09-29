import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { env } from "./env";

/**
 * Bloqueos y lÃ­mite de envÃ­os.
 * - Con Upstash Redis (producciÃ³n): funcionan entre todas las instancias de Vercel.
 * - Sin Redis (desarrollo/pruebas): funcionan dentro de un solo proceso.
 */

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = env.redisUrl();
  const token = env.redisToken();
  redis = url && token ? new Redis({ url, token }) : null;
  if (!redis && process.env.VERCEL) {
    console.warn("[lock] Sin Redis configurado: los bloqueos solo protegen dentro de cada instancia.");
  }
  return redis;
}

export class BusyError extends Error {
  constructor() {
    super("Hay mucha actividad en este momento. ProbÃ¡ de nuevo en unos segundos.");
    this.name = "BusyError";
  }
}

// ---------------------------------------------------------------------------
// Bloqueo local (cola de promesas por clave)
// ---------------------------------------------------------------------------
const localQueues = new Map<string, Promise<unknown>>();

async function withLocalLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = localQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((r) => (release = r));
  const chained = prev.then(() => current);
  localQueues.set(key, chained);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (localQueues.get(key) === chained) localQueues.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Bloqueo distribuido (SET NX PX + liberaciÃ³n segura)
// ---------------------------------------------------------------------------
const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export async function withLock<T>(key: string, fn: () => Promise<T>, opts: { ttlMs?: number; waitMs?: number } = {}): Promise<T> {
  const r = getRedis();
  // Siempre serializamos tambiÃ©n dentro del proceso (barato y evita esperas innecesarias en Redis).
  return withLocalLock(key, async () => {
    if (!r) return fn();
    const ttl = opts.ttlMs ?? 15_000;
    const deadline = Date.now() + (opts.waitMs ?? 10_000);
    const token = randomUUID();
    const k = `gt47:lock:${key}`;
    let delay = 60;
    while (true) {
      const ok = await r.set(k, token, { nx: true, px: ttl });
      if (ok) break;
      if (Date.now() > deadline) throw new BusyError();
      await new Promise((res) => setTimeout(res, delay + Math.random() * 40));
      delay = Math.min(delay * 1.6, 500);
    }
    try {
      return await fn();
    } finally {
      await r.eval(RELEASE_SCRIPT, [k], [token]).catch(() => undefined);
    }
  });
}

// ---------------------------------------------------------------------------
// LÃ­mite de envÃ­os (ventana fija)
// ---------------------------------------------------------------------------
const localCounters = new Map<string, { n: number; until: number }>();

/** Devuelve true si todavÃ­a estÃ¡ dentro del lÃ­mite. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const r = getRedis();
  const k = `gt47:rl:${key}`;
  if (r) {
    const n = await r.incr(k);
    if (n === 1) await r.expire(k, windowSec);
    return n <= max;
  }
  const now = Date.now();
  const c = localCounters.get(k);
  if (!c || c.until < now) {
    localCounters.set(k, { n: 1, until: now + windowSec * 1000 });
    return true;
  }
  c.n += 1;
  return c.n <= max;
}

/** Solo para pruebas. */
export function resetLocalLimits() {
  localCounters.clear();
}
