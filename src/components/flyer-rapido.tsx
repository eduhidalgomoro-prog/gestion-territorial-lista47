"use client";

import { useState } from "react";
import { esFlyerSubido, linkDescarga } from "@/lib/flyers";
import type { EstadoFlyer } from "@/lib/schema";
import { IconAlert, IconDownload, IconImage, IconLink, IconSearch, IconShare, IconX } from "./icons";
import { cx } from "./ui";

/**
 * Acceso rápido al flyer en la ficha de la actividad: ver, descargar y compartir.
 * Lee los mismos archivos que «Comunicación» (una sola fuente); la gestión (subir, reemplazar, estados) sigue allá.
 * Solo muestra la pieza cuando está APROBADA o PUBLICADA: lo que está en diseño o en revisión no se presenta como final.
 */

type Pieza = { id: "feed" | "historia"; label: string; url: string };

const FINAL: EstadoFlyer[] = ["APROBADO", "PUBLICADO"];
const PROCESO: Partial<Record<EstadoFlyer, string>> = {
  SOLICITADO: "Flyer pedido: todavía no empezó el diseño.",
  "EN DISEÑO": "El flyer está en diseño.",
  "PARA APROBACIÓN": "El flyer está esperando aprobación.",
};

export function FlyerRapido({
  nombre, estado, feed, historia, comunicacionHref,
}: {
  nombre: string;
  estado: EstadoFlyer | "";
  feed: string;
  historia: string;
  /** Solo para quien gestiona flyers: lleva a la sección Comunicación de la ficha. */
  comunicacionHref?: string;
}) {
  const final = !!estado && FINAL.includes(estado);
  const piezas: Pieza[] = final
    ? [
        { id: "feed" as const, label: "Feed", url: feed },
        { id: "historia" as const, label: "Historia", url: historia },
      ].filter((p) => esFlyerSubido(p.url))
    : [];
  const linkExterno = final && feed && !esFlyerSubido(feed) ? feed : "";
  const [elegida, setElegida] = useState<Pieza["id"]>("feed");
  const pieza = piezas.find((p) => p.id === elegida) ?? piezas[0];
  const [grande, setGrande] = useState(false);

  // Sin pieza final: una línea compacta (no una tarjeta grande vacía).
  if (!pieza) {
    const texto = final
      ? linkExterno
        ? "Flyer listo (está en un link externo)."
        : `Flyer ${estado === "PUBLICADO" ? "publicado" : "aprobado"}, pero la imagen no se cargó en la app.`
      : (estado && PROCESO[estado]) || "Todavía no hay un flyer disponible.";
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,105,133,0.05)] ring-1 ring-linea" aria-label="Flyer de la actividad">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-fondo text-gris" aria-hidden><IconImage size={22} /></span>
        <div className="min-w-[11rem] flex-1">
          <p className="text-[12px] font-extrabold tracking-[0.14em] text-gris uppercase">Flyer de la actividad</p>
          <p className="text-[15px] font-semibold">{texto}</p>
        </div>
        {linkExterno && (
          <a href={linkExterno} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold text-petroleo ring-1 ring-linea hover:bg-fondo">
            <IconLink size={17} /> Ver flyer
          </a>
        )}
        {comunicacionHref && !linkExterno && (
          <a href={comunicacionHref} className="inline-flex h-10 items-center rounded-full px-3.5 text-[14px] font-bold text-petroleo ring-1 ring-linea hover:bg-fondo">
            Ir a Comunicación
          </a>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-[24px] bg-white p-4 shadow-[0_1px_3px_rgba(16,105,133,0.07)] ring-1 ring-linea sm:p-5" aria-labelledby="flyer-titulo">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="flyer-titulo" className="text-[12px] font-extrabold tracking-[0.14em] text-gris uppercase">Flyer de la actividad</h2>
        {piezas.length > 1 ? (
          <div className="inline-flex rounded-full bg-fondo p-1" role="tablist" aria-label="Pieza">
            {piezas.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={pieza.id === p.id}
                onClick={() => setElegida(p.id)}
                className={cx("h-9 rounded-full px-4 text-[14px] font-bold transition-colors", pieza.id === p.id ? "bg-white text-petroleo-600 shadow-sm" : "text-gris")}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[13px] font-semibold text-gris">{pieza.label} · {pieza.id === "feed" ? "Historia" : "Feed"} no disponible</span>
        )}
      </div>

      <Miniatura key={pieza.url} pieza={pieza} nombre={nombre} onAbrir={() => setGrande(true)} />

      <p className="mt-2.5 text-center text-[14px] font-semibold text-marca-600">✓ {pieza.label} · {estado === "PUBLICADO" ? "Publicado" : "Aprobado"}</p>
      <Acciones pieza={pieza} nombre={nombre} onVer={() => setGrande(true)} />

      {grande && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/85 p-4" role="dialog" aria-modal="true" aria-label={`Flyer de ${nombre}`} onClick={() => setGrande(false)}>
          <div className="flex max-h-full w-full max-w-lg flex-col items-center" onClick={(e) => e.stopPropagation()} style={{ animation: "aparecer .18s ease-out" }}>
            <div className="mb-3 flex w-full items-center justify-between gap-3 text-white">
              <p className="min-w-0 truncate font-bold">{nombre} · {pieza.label}</p>
              <button type="button" onClick={() => setGrande(false)} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" aria-label="Cerrar">
                <IconX />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pieza.url} alt={`Flyer de ${nombre} (${pieza.label})`} className="max-h-[68dvh] w-auto rounded-2xl bg-white object-contain shadow-2xl" />
            <div className="mt-4 w-full max-w-sm">
              <Acciones pieza={pieza} nombre={nombre} oscuro />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Miniatura con alto controlado (no se recorta ni deforma), con carga suave y reintento si falla. */
function Miniatura({ pieza, nombre, onAbrir }: { pieza: Pieza; nombre: string; onAbrir: () => void }) {
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [intento, setIntento] = useState(0);
  const src = intento ? `${pieza.url}${pieza.url.includes("?") ? "&" : "?"}r=${intento}` : pieza.url;
  if (estado === "error") {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-2xl bg-fondo text-center">
        <IconAlert size={24} className="text-gris" />
        <p className="text-[15px] font-semibold">No pudimos cargar el flyer.</p>
        <button type="button" onClick={() => { setEstado("cargando"); setIntento((n) => n + 1); }} className="h-10 rounded-full px-4 text-[14px] font-bold text-petroleo ring-1 ring-linea hover:bg-white">
          Reintentar
        </button>
      </div>
    );
  }
  return (
    <button type="button" onClick={onAbrir} className="group relative flex h-[220px] w-full items-center justify-center overflow-hidden rounded-2xl bg-fondo sm:h-[260px]" aria-label={`Ver el ${pieza.label.toLowerCase()} en grande`}>
      {estado === "cargando" && <span className="absolute inset-3 animate-pulse rounded-xl bg-linea/60" aria-hidden />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        // Si la imagen ya estaba en caché, carga antes de que la página «despierte»: se detecta acá.
        ref={(el) => {
          if (el?.complete && el.naturalWidth && estado === "cargando") setEstado("ok");
        }}
        src={src}
        alt={`Flyer de ${nombre} (${pieza.label})`}
        loading="lazy"
        decoding="async"
        onLoad={() => setEstado("ok")}
        onError={() => setEstado("error")}
        className={cx("h-full w-auto max-w-full rounded-xl object-contain p-2 shadow-[0_1px_4px_rgba(0,0,0,0.08)] transition-opacity duration-200 group-hover:scale-[1.01]", estado === "ok" ? "opacity-100" : "opacity-0")}
      />
      <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-bold text-tinta shadow-sm" aria-hidden>
        <IconSearch size={13} /> Ampliar
      </span>
    </button>
  );
}

function Acciones({ pieza, nombre, onVer, oscuro }: { pieza: Pieza; nombre: string; onVer?: () => void; oscuro?: boolean }) {
  const [compartiendo, setCompartiendo] = useState(false);

  /** Comparte la imagen (en el celular abre WhatsApp, etc.). Si no se puede, el link; si tampoco, WhatsApp con el link. */
  async function compartir() {
    setCompartiendo(true);
    const texto = `Flyer: ${nombre}`;
    try {
      if (navigator.share) {
        try {
          const res = await fetch(pieza.url);
          const blob = await res.blob();
          const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
          const file = new File([blob], `flyer-${pieza.id}.${ext}`, { type: blob.type || "image/jpeg" });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: nombre, text: texto });
            return;
          }
        } catch (e) {
          if ((e as Error)?.name === "AbortError") return; // canceló
        }
        await navigator.share({ title: nombre, text: texto, url: pieza.url });
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n${pieza.url}`)}`, "_blank", "noopener");
    } catch {
      // canceló o el navegador no dejó: no pasa nada
    } finally {
      setCompartiendo(false);
    }
  }

  const base = "inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 text-[14px] font-bold whitespace-nowrap transition-transform active:scale-[0.97] sm:gap-1.5 sm:text-[15px]";
  const sec = oscuro ? "bg-white/15 text-white hover:bg-white/25" : "text-petroleo ring-1 ring-linea hover:bg-fondo";
  return (
    <div className="mt-3 flex gap-1.5 sm:gap-2">
      {onVer && (
        <button type="button" onClick={onVer} className={cx(base, sec)}>
          <IconSearch size={18} /> Ver
        </button>
      )}
      <a href={linkDescarga(pieza.url)} download className={cx(base, sec)}>
        <IconDownload size={18} /> Descargar
      </a>
      <button type="button" onClick={compartir} disabled={compartiendo} className={cx(base, oscuro ? "bg-white text-tinta" : "bg-marca text-white hover:bg-marca-600", "disabled:opacity-60")}>
        <IconShare size={18} /> Compartir
      </button>
    </div>
  );
}
