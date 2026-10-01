"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { btn, cx } from "@/components/ui";
import type { ActionResult } from "@/lib/errors";

/** Botón que ejecuta una acción del servidor y muestra el resultado al lado. */
export function BotonAccion({ action, children, variante = "secundario", confirmar }: {
  action: () => Promise<ActionResult<unknown>>;
  children: ReactNode;
  variante?: "primario" | "secundario" | "fantasma";
  confirmar?: string;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pendiente}
        className={btn(variante)}
        onClick={() => {
          if (confirmar && !confirm(confirmar)) return;
          start(async () => {
            const r = await action();
            setMsg({ t: r.message ?? (r.ok ? "Listo." : "No se pudo."), ok: r.ok });
            if (r.ok) router.refresh();
          });
        }}
      >
        {pendiente ? "Un momento…" : children}
      </button>
      {msg && <span className={cx("text-sm font-semibold", msg.ok ? "text-ok" : "text-peligro")}>{msg.t}</span>}
    </span>
  );
}
