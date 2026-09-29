import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

/**
 * Íconos de la app instalada: sello «LISTA 47» (círculo verde) sobre el degradado institucional.
 * Cuando esté el logo oficial en /public/brand, se puede reemplazar acá.
 * «maskable» deja margen para que Android pueda recortarlo en círculo sin cortar el sello.
 */
const SIZES = new Set([180, 192, 512]);

export async function GET(request: NextRequest, ctx: RouteContext<"/icons/[size]">) {
  const { size: raw } = await ctx.params;
  const size = SIZES.has(Number(raw)) ? Number(raw) : 192;
  const maskable = request.nextUrl.searchParams.has("maskable");
  const circle = Math.round(size * (maskable ? 0.62 : 0.8));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, #0c546b 0%, #106985 55%, #3f8f3a 100%)",
        }}
      >
        <div
          style={{
            width: circle, height: circle, borderRadius: circle, background: "#66BA47", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, border: `${Math.max(2, Math.round(size * 0.02))}px solid rgba(255,255,255,0.85)`,
          }}
        >
          <div style={{ fontSize: circle * 0.19, letterSpacing: circle * 0.01, lineHeight: 1 }}>LISTA</div>
          <div style={{ fontSize: circle * 0.46, lineHeight: 1 }}>47</div>
        </div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
