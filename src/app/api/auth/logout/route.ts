import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { VER_COMO_COOKIE } from "@/lib/permisos";

export async function POST(request: NextRequest) {
  // Solo desde la propia app (evita cierres de sesión forzados desde otros sitios).
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(VER_COMO_COOKIE); // al salir, también termina «Ver la app como…»
  return res;
}
