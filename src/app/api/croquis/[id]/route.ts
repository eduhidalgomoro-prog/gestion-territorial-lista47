import { del, put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { usuarioActual } from "@/lib/auth";
import { snapshot, update } from "@/lib/db";
import { esFlyerSubido, FLYER_MAX_BYTES, FLYER_TIPOS } from "@/lib/flyers";
import { puede } from "@/lib/permisos";
import { slugify } from "@/lib/util";

/**
 * Subir (POST) o quitar (DELETE) la imagen del croquis de una feria (foto o plano del lugar).
 * Se guarda en Vercel Blob; en la planilla queda solo el link. Los puestos se ubican en % de la imagen.
 */

async function feriaConPermiso(id: string) {
  const yo = await usuarioActual();
  if (!yo) return { error: NextResponse.json({ error: "Tenés que iniciar sesión." }, { status: 401 }) };
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a) return { error: NextResponse.json({ error: "La actividad no existe." }, { status: 404 }) };
  if (!puede.editarActividad(yo, a)) return { error: NextResponse.json({ error: "No tenés permiso para cambiar este croquis." }, { status: 403 }) };
  return { yo, a };
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await feriaConPermiso(id);
  if ("error" in r) return r.error;
  const fd = await request.formData().catch(() => null);
  const file = fd?.get("archivo");
  if (!(file instanceof File)) return NextResponse.json({ error: "No llegó la imagen." }, { status: 400 });
  if (!FLYER_TIPOS.includes(file.type)) return NextResponse.json({ error: "Tiene que ser una imagen JPG, PNG o WebP." }, { status: 400 });
  if (file.size > FLYER_MAX_BYTES) return NextResponse.json({ error: "La imagen es demasiado grande (máximo 4 MB)." }, { status: 400 });
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const blob = await put(`croquis/${r.a.anio || "sin-fecha"}/${slugify(r.a.nombre) || r.a.id}.${ext}`, file, { access: "public", addRandomSuffix: true, contentType: file.type });
  const anterior = r.a.croquis;
  await update("actividades", id, { croquis: blob.url }, r.yo.email, { accion: "subir croquis" });
  if (esFlyerSubido(anterior)) await del(anterior).catch((e) => console.error("[croquis] no se pudo borrar el anterior", e));
  revalidatePath("/", "layout");
  return NextResponse.json({ url: blob.url });
}

export async function DELETE(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await feriaConPermiso(id);
  if ("error" in r) return r.error;
  const anterior = r.a.croquis;
  await update("actividades", id, { croquis: "" }, r.yo.email, { accion: "quitar croquis" });
  if (esFlyerSubido(anterior)) await del(anterior).catch((e) => console.error("[croquis] no se pudo borrar el anterior", e));
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
