import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { env } from "./env";
import { rateLimit } from "./lock";

/**
 * Protección del formulario público (sin molestar a las personas):
 * 1. Campo trampa invisible (los robots lo completan).
 * 2. Tiempo mínimo de llenado, con marca de tiempo firmada.
 * 3. Límite de envíos por conexión (la IP se usa solo como hash temporal, nunca se guarda en la planilla).
 */

const MIN_MS = 3_000;
const MAX_MS = 12 * 60 * 60 * 1000;

function sign(v: string) {
  return createHmac("sha256", env.authSecret()).update(v).digest("base64url").slice(0, 22);
}

export function formToken(): string {
  const ts = String(Date.now());
  return `${ts}.${sign(ts)}`;
}

function tokenOk(token: string): boolean {
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return false;
  const expected = Buffer.from(sign(ts));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
  const age = Date.now() - Number(ts);
  return age >= MIN_MS && age <= MAX_MS;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "local").trim();
}

export type SpamCheck = { ok: true } | { ok: false; silencioso: boolean; message: string };

export async function checkSpam(fd: FormData, scope: string): Promise<SpamCheck> {
  // Trampa: responder "éxito" sin guardar nada para no darle pistas al robot.
  if (String(fd.get("sitio_web") ?? "")) return { ok: false, silencioso: true, message: "" };
  if (!tokenOk(String(fd.get("_t") ?? ""))) {
    return { ok: false, silencioso: false, message: "El formulario se envió demasiado rápido o estuvo abierto mucho tiempo. Recargá la página y probá de nuevo." };
  }
  const ip = await clientIp();
  const ipHash = createHash("sha256").update(ip + env.authSecret()).digest("hex").slice(0, 24);
  // Límites holgados: en un barrio muchas personas pueden inscribirse desde el mismo wifi.
  const okScope = await rateLimit(`form:${scope}:${ipHash}`, 15, 600);
  const okGlobal = await rateLimit(`form:all:${ipHash}`, 60, 3600);
  if (!okScope || !okGlobal) {
    return { ok: false, silencioso: false, message: "Recibimos muchos envíos desde esta conexión. Esperá unos minutos y probá de nuevo." };
  }
  return { ok: true };
}
