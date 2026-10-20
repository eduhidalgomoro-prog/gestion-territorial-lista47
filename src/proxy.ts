import { NextResponse, type NextRequest } from "next/server";
import { AYUDANTE_COOKIE, SESSION_COOKIE, verifyAyudanteToken, verifySessionToken } from "@/lib/auth/session";

/**
 * Primera barrera del panel: sin sesión válida se redirige a /login.
 * Cada página y acción vuelve a comprobar la sesión y el ROL (defensa en profundidad).
 * El formulario público de inscripción (/inscripcion/...) queda separado y sin login.
 */
// /guias/: guías de organización (sin datos personales), pensadas para compartir por WhatsApp.
// /ayudante/: entrada con el QR de ayudante (pide el nombre y valida el acceso).
const PUBLIC_PREFIXES = ["/inscripcion/", "/feria/", "/login", "/privacidad", "/api/auth/", "/offline", "/icons/", "/guias/", "/ayudante/"];
const PUBLIC_FILES = ["/manifest.webmanifest", "/sw.js", "/favicon.ico", "/robots.txt"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_FILES.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  // Ayudante con QR: solo las pantallas de SU actividad (lo demás lo lleva de vuelta ahí).
  const ayudante = await verifyAyudanteToken(request.cookies.get(AYUDANTE_COOKIE)?.value);
  if (ayudante) {
    const base = `/actividades/${ayudante.actividadId}`;
    if (pathname === base || pathname.startsWith(`${base}/`)) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = base;
    url.search = "";
    return NextResponse.redirect(url);
  }
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
