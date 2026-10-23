"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { asistenciaFerianteAction } from "@/app/(panel)/actions";
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
        className={cx("min-h-9 rounded-lg px-2.5 text-[13px] font-bold ring-1", actual === "SI" ? "bg-ok text-white ring-ok" : "bg-white text-ok ring-ok/40")}
      >
        ✓ Vino
      </button>
      <button
        type="button"
        disabled={pendiente}
        aria-pressed={actual === "NO"}
        onClick={() => marcar("NO")}
        className={cx("min-h-9 rounded-lg px-2.5 text-[13px] font-bold ring-1", actual === "NO" ? "bg-peligro text-white ring-peligro" : "bg-white text-peligro ring-peligro/40")}
      >
        ✗ No vino
      </button>
      {error && <span className="text-[12px] font-semibold text-peligro">{error}</span>}
    </span>
  );
}
