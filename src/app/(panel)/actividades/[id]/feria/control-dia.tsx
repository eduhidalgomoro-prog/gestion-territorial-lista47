"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { asistenciaFerianteAction, estadoFerianteAction } from "@/app/(panel)/actions";
import { cx } from "@/components/ui";

/** Control del día de la feria: «Vino» / «No vino» (tocar de nuevo lo deja sin marcar). */
export function VinoONo({ ferianteId, valor }: { ferianteId: string; valor: string }) {
  const router = useRouter();
  const [actual, setActual] = useState(valor);
  const [pendiente, start] = useTransition();
  const [error, setError] = useState("");
  const marcar = (v: string) =>
    start(async () => {
      const nuevo = actual === v ? "" : v;
      const r = await asistenciaFerianteAction(ferianteId, nuevo);
      if (r.ok) {
        setActual(nuevo);
        setError("");
        router.refresh();
      } else setError(r.message ?? "No se pudo guardar.");
    });
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={pendiente}
        aria-pressed={actual === "SI"}
        onClick={() => marcar("SI")}
        className={cx("min-h-9 rounded-lg px-2.5 whitespace-nowrap text-[13px] font-bold ring-1", actual === "SI" ? "bg-ok text-white ring-ok" : "bg-white text-ok ring-ok/40")}
      >
        ✓ Vino
      </button>
      <button
        type="button"
        disabled={pendiente}
        aria-pressed={actual === "NO"}
        onClick={() => marcar("NO")}
        className={cx("min-h-9 rounded-lg px-2.5 whitespace-nowrap text-[13px] font-bold ring-1", actual === "NO" ? "bg-peligro text-white ring-peligro" : "bg-white text-peligro ring-peligro/40")}
      >
        ✗ No vino
      </button>
      {error && <span className="text-[12px] font-semibold text-peligro">{error}</span>}
    </span>
  );
}

/** Dar de baja desde la planilla: libera su lugar y su puesto (después se pasa a la primera de la lista de espera). */
export function DarDeBaja({ ferianteId, nombre }: { ferianteId: string; nombre: string }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => {
          if (!confirm(`¿Dar de baja a ${nombre}? Se libera su lugar y su puesto.`)) return;
          start(async () => {
            const r = await estadoFerianteAction(ferianteId, false);
            if (r.ok) router.refresh();
            else setError(r.message ?? "No se pudo.");
          });
        }}
        className="min-h-9 rounded-lg px-1 whitespace-nowrap text-[13px] font-bold text-peligro underline-offset-2 hover:underline"
      >
        {pendiente ? "Un momento…" : "Dar de baja"}
      </button>
      {error && <span className="text-[12px] font-semibold text-peligro">{error}</span>}
    </span>
  );
}
