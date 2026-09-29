import { SignJWT, jwtVerify } from "jose";
import { env } from "../env";

/**
 * Sesión: cookie HttpOnly firmada (JWT HS256). No se guardan contraseñas en ningún lado:
 * se ingresa con la cuenta de Google y el ROL sale de la hoja USUARIOS en cada pedido,
 * así que desactivar a alguien en la planilla le corta el acceso de inmediato.
 */

export const SESSION_COOKIE = "gt47_session";
export const SESSION_DAYS = 30;

export interface Session {
  email: string;
  name: string;
}

function key(): Uint8Array {
  const s = env.authSecret();
  if (s.length < 32) throw new Error("AUTH_SECRET debe tener al menos 32 caracteres (ver .env.example).");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({ name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.email.toLowerCase())
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setIssuer("gestion-territorial-47")
    .sign(key());
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "gestion-territorial-47", algorithms: ["HS256"] });
    const email = String(payload.sub ?? "");
    if (!email) return null;
    return { email, name: String(payload.name ?? email) };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
};
