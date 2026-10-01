"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { ubicarPuestosAction } from "@/app/(panel)/actions";
import { TIPO_PUESTO_HEX, TIPO_PUESTO_LABEL } from "@/lib/ferias";
import type { TipoPuesto } from "@/lib/schema";
import { achicar } from "./flyer-imagen";
import { IconUpload } from "./icons";
import { btn, cx } from "./ui";

export interface PuestoCroquis {
  numero: number;
  tipo: TipoPuesto;
  x: number; // % del ancho (0 = sin ubicar)
  y: number;
}

function Pin({ p, grande, activo, onClick }: { p: PuestoCroquis; grande?: boolean; activo?: boolean; onClick?: () => void }) {
  const s = grande ? 34 : 24;
  return (
    <button
      type="button"
      onClick={(e) => {
        // Tocar un puesto lo elige (sin moverlo al lugar del toque).
        e.stopPropagation();
        onClick?.();
      }}
      tabIndex={onClick ? 0 : -1}
      aria-label={`Puesto ${p.numero}`}
      className={cx("absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white font-extrabold text-white shadow-md", grande && "z-10 ring-4 ring-amber-300", activo && "z-10 ring-4 ring-tinta", !onClick && "pointer-events-none")}
      style={{ left: `${p.x}%`, top: `${p.y}%`, width: s, height: s, fontSize: grande ? 15 : 11, background: TIPO_PUESTO_HEX[p.tipo] }}
    >
      {p.numero}
    </button>
  );
}

export function LeyendaPuestos() {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-gris">
      {(Object.keys(TIPO_PUESTO_LABEL) as TipoPuesto[]).map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full" style={{ background: TIPO_PUESTO_HEX[t] }} /> {TIPO_PUESTO_LABEL[t]}
        </span>
      ))}
    </div>
  );
}

/** Croquis de solo lectura: la imagen del lugar con los puestos numerados (y uno destacado). */
export function CroquisVista({ url, puestos, destacado }: { url: string; puestos: PuestoCroquis[]; destacado?: number }) {
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-linea bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen subida a Vercel Blob, tamaño variable */}
        <img src={url} alt="Croquis del lugar con los puestos numerados" className="block h-auto w-full select-none" draggable={false} />
        {puestos.filter((p) => p.x || p.y).map((p) => <Pin key={p.numero} p={p} grande={p.numero === destacado} />)}
      </div>
      <LeyendaPuestos />
    </div>
  );
}

/**
 * Editor del croquis: subir la imagen y ubicar cada puesto tocando la imagen.
 * Al tocar, el puesto elegido queda ahí y se pasa solo al siguiente sin ubicar (así se marcan 40 puestos rápido).
 */
export function CroquisEditor({ actividadId, url, puestos }: { actividadId: string; url: string; puestos: PuestoCroquis[] }) {
  const router = useRouter();
  const [pos, setPos] = useState(() => new Map(puestos.map((p) => [p.numero, { x: p.x, y: p.y }])));
  const [elegido, setElegido] = useState<number>(() => puestos.find((p) => !p.x && !p.y)?.numero ?? puestos[0]?.numero ?? 0);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, startGuardar] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const tipoDe = useMemo(() => new Map(puestos.map((p) => [p.numero, p.tipo])), [puestos]);
  const cambios = puestos.some((p) => {
    const q = pos.get(p.numero)!;
    return q.x !== p.x || q.y !== p.y;
  });
  const sinUbicar = puestos.filter((p) => {
    const q = pos.get(p.numero)!;
    return !q.x && !q.y;
  }).length;

  function tocar(e: React.MouseEvent<HTMLDivElement>) {
    if (!elegido) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 10000) / 100;
    const y = Math.round(((e.clientY - r.top) / r.height) * 10000) / 100;
    const next = new Map(pos).set(elegido, { x, y });
    setPos(next);
    // Siguiente puesto sin ubicar (en orden).
    const sig = puestos.find((p) => p.numero > elegido && !next.get(p.numero)!.x && !next.get(p.numero)!.y) ?? puestos.find((p) => !next.get(p.numero)!.x && !next.get(p.numero)!.y);
    setElegido(sig?.numero ?? 0);
    setMsg(null);
  }

  async function subir(file: File) {
    setSubiendo(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("archivo", await achicar(file, 2400), "croquis.jpg");
      const res = await fetch(`/api/croquis/${actividadId}`, { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "No se pudo subir la imagen.");
      router.refresh();
    } catch (e) {
      setMsg({ t: (e as Error).message, ok: false });
    } finally {
      setSubiendo(false);
    }
  }

  function guardar() {
    startGuardar(async () => {
      const r = await ubicarPuestosAction(actividadId, [...pos].map(([numero, q]) => ({ numero, ...q })));
      setMsg({ t: r.ok ? "Croquis guardado." : r.message ?? "No se pudo guardar.", ok: r.ok });
      if (r.ok) router.refresh();
    });
  }

  const subidor = (
    <>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={subiendo} className={btn(url ? "secundario" : "primario", url ? "sm" : "md")}>
        <IconUpload size={18} /> {subiendo ? "Subiendo…" : url ? "Cambiar imagen" : "Subir imagen del lugar"}
      </button>
    </>
  );

  if (!url) {
    return (
      <div className="rounded-2xl border border-dashed border-linea bg-white p-6 text-center">
        <p className="mb-3 text-[15px] text-gris">Subí una foto, captura de Google Maps o plano del parque. Después tocás la imagen para ubicar cada puesto.</p>
        {subidor}
        {msg && <p className={cx("mt-2 text-sm font-semibold", msg.ok ? "text-ok" : "text-peligro")}>{msg.t}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px]">
          {elegido ? (
            <>Tocá la imagen donde va el <b>puesto N° {elegido}</b> <span className="text-gris">({tipoDe.get(elegido) && TIPO_PUESTO_LABEL[tipoDe.get(elegido)!].toLowerCase()})</span></>
          ) : (
            <b>Todos los puestos están ubicados.</b>
          )}
          {sinUbicar > 0 && <span className="text-gris"> · faltan {sinUbicar}</span>}
        </p>
        {subidor}
      </div>
      <div className="relative cursor-crosshair overflow-hidden rounded-2xl border border-linea bg-white" onClick={tocar}>
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen subida a Vercel Blob, tamaño variable */}
        <img src={url} alt="Croquis del lugar" className="block h-auto w-full select-none" draggable={false} />
        {puestos.map((p) => {
          const q = pos.get(p.numero)!;
          return q.x || q.y ? (
            <Pin key={p.numero} p={{ ...p, ...q }} activo={p.numero === elegido} onClick={() => setElegido(p.numero)} />
          ) : null;
        })}
      </div>
      <LeyendaPuestos />
      <p className="mt-2 text-sm text-gris">Para mover un puesto, tocalo (queda marcado) y después tocá el lugar nuevo. Elegí cualquier número abajo para reubicarlo.</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {puestos.map((p) => {
          const q = pos.get(p.numero)!;
          return (
            <button
              key={p.numero}
              type="button"
              onClick={() => setElegido(p.numero)}
              className={cx("min-h-9 min-w-9 rounded-lg border-2 px-1 text-sm font-bold", p.numero === elegido ? "border-tinta" : "border-transparent", q.x || q.y ? "text-white" : "bg-white text-gris")}
              style={q.x || q.y ? { background: TIPO_PUESTO_HEX[p.tipo] } : { borderColor: p.numero === elegido ? undefined : TIPO_PUESTO_HEX[p.tipo] }}
            >
              {p.numero}
            </button>
          );
        })}
      </div>
      <div className="sticky bottom-20 z-20 mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 p-2 shadow-sm lg:bottom-2">
        <button type="button" onClick={guardar} disabled={guardando || !cambios} className={btn("primario")}>
          {guardando ? "Guardando…" : "Guardar croquis"}
        </button>
        {cambios && <span className="text-sm font-semibold text-alerta">Hay cambios sin guardar.</span>}
        {msg && <span className={cx("text-sm font-semibold", msg.ok ? "text-ok" : "text-peligro")}>{msg.t}</span>}
      </div>
    </div>
  );
}
