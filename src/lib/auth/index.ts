import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { snapshot } from "../db";
import { ForbiddenError } from "../errors";
import { resolverUsuario, type Yo } from "../permisos";
import { SESSION_COOKIE, verifySessionToken, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Usar al principio de CADA página privada y Server Action (además del proxy).
 * Devuelve el usuario con su rol, leído de la hoja USUARIOS.
 */
export async function requireUser(): Promise<Yo> {
  const s = await getSession();
  if (!s) redirect("/login");
  const { usuarios } = await snapshot();
  const yo = resolverUsuario(s.email, s.name, usuarios);
  if (!yo) redirect("/login?error=no_autorizado");
  return yo;
}

/** Para rutas de API: devuelve el usuario o null (sin redirigir). */
export async function usuarioActual(): Promise<Yo | null> {
  const s = await getSession();
  if (!s) return null;
  const { usuarios } = await snapshot();
  return resolverUsuario(s.email, s.name, usuarios);
}

/** Igual que requireUser pero para acciones: si no cumple la condición, error de permiso. */
export async function requireUserWhere(cond: (yo: Yo) => boolean, msg?: string): Promise<Yo> {
  const yo = await requireUser();
  if (!cond(yo)) throw new ForbiddenError(msg);
  return yo;
}
