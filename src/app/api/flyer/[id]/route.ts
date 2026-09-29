import { del, put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { usuarioActual } from "@/lib/auth";
import { snapshot, update } from "@/lib/db";
import { esFlyerSubido, FLYER_MAX_BYTES, FLYER_TIPOS, formatoDe } from "@/lib/flyers";
import { puede } from "@/lib/permisos";
import { slugify } from "@/lib/util";

/**
 * Subir (POST) o quitar (DELETE) una imagen del flyer de una actividad.
 * ?formato=feed (por defecto) o ?formato=historia.
 * La imagen llega ya achicada desde el navegador; se guarda en Vercel Blob y en la planilla queda solo el link.
 */

async function actividadConPermiso(id: string) {
  const yo = await usuarioActual();
  if (!yo) return { error: NextResponse.json({ error: "Tenés que iniciar sesión." }, { status: 401 }) };
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a) return { error: NextResponse.json({ error: "La actividad no existe." }, { status: 404 }) };
  if (!puede.editarFlyer(yo, a)) return { error: NextResponse.json({ error: "No tenés permiso para cambiar este flyer." }, { status: 403 }) };
  return { yo, a };
}

async function borrarAnterior(url: string) {
  if (!esFlyerSubido(url)) return;
  await del(url).catch((e) => console.error("[flyer] no se pudo borrar el anterior", e));
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/flyer/[id]">) {
  const { id } = await ctx.params;
  const formato = formatoDe(request.nextUrl.searchParams.get("formato"));
  const r = await actividadConPermiso(id);
  if ("error" in r) return r.error;
  const fd = await request.formData().catch(() => null);
  const file = fd?.get("archivo");
  if (!(file instanceof File)) return NextResponse.json({ error: "No llegó la imagen." }, { status: 400 });
  if (!FLYER_TIPOS.includes(file.type)) return NextResponse.json({ error: "Tiene que ser una imagen JPG, PNG o WebP." }, { status: 400 });
  if (file.size > FLYER_MAX_BYTES) return NextResponse.json({ error: "La imagen es demasiado grande (máximo 4 MB)." }, { status: 400 });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const blob = await put(`flyers/${r.a.anio || "sin-fecha"}/${slugify(r.a.nombre) || r.a.id}-${formato.id}.${ext}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  const anterior = r.a[formato.campo];
  await update(
    "actividades",
    id,
    { requiere_flyer: true, estado_flyer: r.a.estado_flyer || "SOLICITADO", [formato.campo]: blob.url },
    r.yo.email,
    { accion: `subir flyer ${formato.label.toLowerCase()}` },
  );
  await borrarAnterior(anterior);
  revalidatePath("/", "layout");
  return NextResponse.json({ url: blob.url });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/flyer/[id]">) {
  const { id } = await ctx.params;
  const formato = formatoDe(request.nextUrl.searchParams.get("formato"));
  const r = await actividadConPermiso(id);
  if ("error" in r) return r.error;
  const anterior = r.a[formato.campo];
  await update("actividades", id, { [formato.campo]: "" }, r.yo.email, { accion: `quitar flyer ${formato.label.toLowerCase()}` });
  await borrarAnterior(anterior);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
