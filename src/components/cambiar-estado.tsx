"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cambiarEstadoAction } from "@/app/(panel)/actions";
import { ESTADO_HEX, titulo } from "@/lib/labels";
import type { EstadoActividad } from "@/lib/schema";
import { cx } from "./ui";

/** «Cambiar estado»: solo las transiciones que permite la ficha; suspender y cancelar piden confirmación. */
export function CambiarEstado({ actividadId, actual, opciones }: { actividadId: string; actual: EstadoActividad; opciones: EstadoActividad[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [msg, setMsg] = useState("");
  const [pendiente, start] = useTransition();
  if (!opciones.length) return null;
  const elegir = (e: EstadoActividad) => {
    if ((e === "SUSPENDIDA" || e === "CANCELADA") && !confirm(`¿Seguro que querés pasar la actividad a ${titulo(e).toLowerCase()}?`)) return;
    start(async () => {
      const r = await cambiarEstadoAction(actividadId, e);
      setMsg(r.ok ? "" : r.message ?? "No se pudo cambiar.");
      if (r.ok) {
        setAbierto(false);
        router.refresh();
      }
    });
  };
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-linea bg-white px-3 text-sm font-bold text-petroleo hover:border-petroleo"
      >
        {pendiente ? "Cambiando…" : "Cambiar estado"}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className={cx("transition-transform", abierto && "rotate-180")}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {abierto && (
        // En el celular se abre en el lugar (no flota fuera de la pantalla); en computadora, como menú flotante.
        <ul className="z-30 mt-1 w-56 max-w-full animate-[aparecer_.15s_ease-out] rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-linea sm:absolute sm:left-0">
          <li className="px-3 py-1.5 text-xs font-bold text-gris uppercase">Ahora: {titulo(actual)}</li>
          {opciones.map((e) => (
            <li key={e}>
              <button
                type="button"
                disabled={pendiente}
                onClick={() => elegir(e)}
                className={cx("flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold hover:bg-fondo", e === "CANCELADA" && "text-peligro")}
              >
                <span className="size-2.5 rounded-full" style={{ background: ESTADO_HEX[e] }} aria-hidden />
                {e === "CONFIRMADA" ? "Confirmar" : `Pasar a ${titulo(e).toLowerCase()}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-1 text-sm font-semibold text-peligro">{msg}</p>}
    </div>
  );
}
