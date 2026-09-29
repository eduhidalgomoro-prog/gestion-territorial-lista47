import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

/**
 * Acceso rápido SOLO para desarrollo local (npm run dev + AUTH_DEV_LOGIN=true).
 * ?email=... permite probar con un usuario de la hoja USUARIOS (y así ver cada rol).
 * En producción esta ruta siempre responde 404.
 */
export async function GET(request: NextRequest) {
  if (!env.devLogin()) return new NextResponse(null, { status: 404 });
  const email = (request.nextUrl.searchParams.get("email") || env.adminEmails()[0] || "").toLowerCase();
  if (!email) return new NextResponse("Configurá ADMIN_EMAILS en .env.local", { status: 400 });
  const res = NextResponse.redirect(new URL("/inicio", request.url));
  res.cookies.set(SESSION_COOKIE, await createSessionToken({ email, name: "Modo desarrollo" }), sessionCookieOptions);
  return res;
}
