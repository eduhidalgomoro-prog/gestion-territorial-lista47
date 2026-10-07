import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { snapshot } from "../db";
import { ForbiddenError } from "../errors";
import { aplicarVerComo, resolverUsuario, VER_COMO_COOKIE, type Yo } from "../permisos";
import { SESSION_COOKIE, verifySessionToken, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** El usuario de verdad (sin «Ver como»): para activar o salir de la vista previa. */
export async function usuarioReal(): Promise<Yo | null> {
  const s = await getSession();
  if (!s) return null;
  const { usuarios } = await snapshot();
  return resolverUsuario(s.email, s.name, usuarios);
}

/** Aplica «Ver la app como…» si quien está conectado es administrador y la eligió. */
async function conVistaPrevia(yo: Yo | null): Promise<Yo | null> {
  if (!yo || yo.rol !== "ADMINISTRADOR") return yo;
  const valor = (await cookies()).get(VER_COMO_COOKIE)?.value;
  if (!valor) return yo;
  const { usuarios } = await snapshot();
  return aplicarVerComo(yo, valor, usuarios);
}

/**
 * Usar al principio de CADA página privada y Server Action (además del proxy).
 * Devuelve el usuario con su rol, leído de la hoja USUARIOS (o el rol que el administrador eligió en «Ver como»).
 */
export async function requireUser(): Promise<Yo> {
  const s = await getSession();
  if (!s) redirect("/login");
  const yo = await conVistaPrevia(await usuarioReal());
  if (!yo) redirect("/login?error=no_autorizado");
  return yo;
}

/** Para rutas de API: devuelve el usuario o null (sin redirigir). */
export async function usuarioActual(): Promise<Yo | null> {
  return conVistaPrevia(await usuarioReal());
}

/** Igual que requireUser pero para acciones: si no cumple la condición, error de permiso. */
export async function requireUserWhere(cond: (yo: Yo) => boolean, msg?: string): Promise<Yo> {
  const yo = await requireUser();
  if (!cond(yo)) throw new ForbiddenError(msg);
  return yo;
}
