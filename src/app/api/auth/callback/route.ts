import { decodeIdToken } from "arctic";
import { NextResponse, type NextRequest } from "next/server";
import { log, snapshot } from "@/lib/db";
import { resolverUsuario } from "@/lib/permisos";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { googleClient } from "@/lib/auth/google";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get("gt47_oauth_state")?.value;
  const verifier = request.cookies.get("gt47_oauth_verifier")?.value;
  const next = request.cookies.get("gt47_oauth_next")?.value || "/inicio";
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));

  if (!code || !state || !savedState || !verifier || state !== savedState) return fail("estado");

  let email = "";
  let name = "";
  try {
    const tokens = await googleClient().validateAuthorizationCode(code, verifier);
    // El id_token llega directo del endpoint de Google por HTTPS (flujo con PKCE), por eso alcanza con decodificarlo.
    const claims = decodeIdToken(tokens.idToken()) as { email?: string; email_verified?: boolean; name?: string };
    if (!claims.email || claims.email_verified !== true) return fail("email");
    email = claims.email.toLowerCase();
    name = claims.name ?? email;
  } catch (err) {
    console.error("[auth] error en callback", err);
    return fail("google");
  }

  let permitido = false;
  try {
    const { usuarios } = await snapshot({ fresh: true });
    permitido = !!resolverUsuario(email, name, usuarios);
  } catch (err) {
    console.error("[auth] no se pudo leer USUARIOS", err);
    return fail("planilla");
  }
  if (!permitido) {
    console.warn(`[auth] acceso denegado para ${email}`);
    return fail("no_autorizado");
  }

  const res = NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/inicio", request.url));
  res.cookies.set(SESSION_COOKIE, await createSessionToken({ email, name }), sessionCookieOptions);
  for (const c of ["gt47_oauth_state", "gt47_oauth_verifier", "gt47_oauth_next"]) res.cookies.delete(c);
  await log(email, "ingreso", "auditoria", "");
  return res;
}
