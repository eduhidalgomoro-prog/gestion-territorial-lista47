import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Primera barrera del panel: sin sesión válida se redirige a /login.
 * Cada página y acción vuelve a comprobar la sesión y el ROL (defensa en profundidad).
 * El formulario público de inscripción (/inscripcion/...) queda separado y sin login.
 */
const PUBLIC_PREFIXES = ["/inscripcion/", "/login", "/privacidad", "/api/auth/", "/offline", "/icons/"];
const PUBLIC_FILES = ["/manifest.webmanifest", "/sw.js", "/favicon.ico", "/robots.txt"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_FILES.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname + request.nextUrl.search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)"],
};
