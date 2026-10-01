"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { esFlyerSubido, formatoDe, linkDescarga, type FormatoFlyer } from "@/lib/flyers";
import { IconDownload, IconUpload } from "./icons";
import { btn, cx } from "./ui";

const LADO_MAX = 2000; // px: suficiente para que el texto del flyer se lea nítido
const CALIDAD = 0.88;

/** Achica la imagen en el navegador (así se sube rápido y ocupa poco). */
export async function achicar(file: File, ladoMax = LADO_MAX): Promise<Blob> {
  // Si ya es liviana, se sube tal cual (conserva la calidad original).
  if (file.size <= 900 * 1024 && file.type !== "image/png") return file;
  const bmp = await createImageBitmap(file);
  const escala = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * escala);
  const h = Math.round(bmp.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", CALIDAD));
  if (!blob) throw new Error("No se pudo procesar la imagen.");
  return blob.size < file.size ? blob : file;
}

/** Las dos versiones del flyer (Feed e Historias), una al lado de la otra. */
export function FlyersActividad({ actividadId, feed, historia, editable, nombre, compacto }: {
  actividadId: string;
  feed: string;
  historia: string;
  editable: boolean;
  nombre: string;
  compacto?: boolean;
}) {
  return (
    <div className={cx("grid gap-4", compacto ? "mt-3 grid-cols-1 min-[420px]:grid-cols-2" : "sm:grid-cols-2")}>
      <FlyerImagen actividadId={actividadId} url={feed} editable={editable} nombre={nombre} compacto={compacto} formato="feed" />
      <FlyerImagen actividadId={actividadId} url={historia} editable={editable} nombre={nombre} compacto={compacto} formato="historia" />
    </div>
  );
}

/**
 * Imagen del flyer de una actividad: vista previa + Descargar para todos;
 * Subir / Reemplazar / Quitar para quien puede editar el flyer.
 */
export function FlyerImagen({ actividadId, url, editable, nombre, compacto, formato = "feed" }: {
  actividadId: string;
  url: string;
  editable: boolean;
  nombre: string;
  compacto?: boolean;
  formato?: FormatoFlyer;
}) {
  const f = formatoDe(formato);
  const endpoint = `/api/flyer/${encodeURIComponent(actividadId)}?formato=${f.id}`;
  const historia = f.id === "historia";
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<"" | "achicando" | "subiendo" | "quitando">("");
  const [error, setError] = useState("");
  const imagen = esFlyerSubido(url);

  async function subir(file: File) {
    setError("");
    if (!file.type.startsWith("image/")) return setError("Elegí una imagen (JPG o PNG).");
    try {
      setEstado("achicando");
      const blob = await achicar(file);
      setEstado("subiendo");
      const fd = new FormData();
      const tipo = blob.type || file.type;
      fd.append("archivo", new File([blob], `flyer.${tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg"}`, { type: tipo }));
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo subir el flyer.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el flyer.");
    } finally {
      setEstado("");
      if (input.current) input.current.value = "";
    }
  }

  async function quitar() {
    if (!confirm(`¿Quitar la imagen del flyer (${f.label})?`)) return;
    setEstado("quitando");
    setError("");
    const res = await fetch(endpoint, { method: "DELETE" });
    if (!res.ok) setError("No se pudo quitar el flyer.");
    setEstado("");
    router.refresh();
  }

  const ocupado = estado !== "";

  return (
    <div>
      <p className="mb-1.5 text-xs font-bold tracking-wide text-gris uppercase">
        {f.label} <span className="font-semibold normal-case">({f.medida})</span>
      </p>
      {imagen && (
        <div className="flex items-start gap-3">
          <a href={url} target="_blank" rel="noopener noreferrer" className="block shrink-0 overflow-hidden rounded-xl border border-linea bg-fondo" title="Ver en tamaño completo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Flyer de ${nombre} (${f.label})`}
              loading="lazy"
              className={cx("object-contain", compacto ? (historia ? "h-32 w-[72px]" : "h-28 w-24") : historia ? "h-64 w-36 sm:h-80 sm:w-44" : "h-56 w-44 sm:h-72 sm:w-56")}
            />
          </a>
          <div className="flex flex-col gap-2">
            <a href={linkDescarga(url)} className={btn("primario", "sm")} download>
              <IconDownload size={18} /> Descargar
            </a>
            {editable && (
              <>
                <button type="button" onClick={() => input.current?.click()} disabled={ocupado} className={btn("secundario", "sm")}>
                  <IconUpload size={18} /> Reemplazar
                </button>
                <button type="button" onClick={quitar} disabled={ocupado} className="text-left text-sm font-semibold text-peligro hover:underline">
                  Quitar
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {!imagen && editable && (
        <button type="button" onClick={() => input.current?.click()} disabled={ocupado} className={btn("petroleo", compacto ? "sm" : "md")}>
          <IconUpload size={18} /> Subir {f.label.toLowerCase()}
        </button>
      )}
      {!imagen && !editable && <p className="text-sm text-gris">Todavía no se subió.</p>}
      {estado && (
        <p className="mt-2 text-sm font-semibold text-petroleo" role="status">
          {estado === "achicando" ? "Preparando la imagen…" : estado === "subiendo" ? "Subiendo…" : "Quitando…"}
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-peligro">{error}</p>}
      <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
    </div>
  );
}
