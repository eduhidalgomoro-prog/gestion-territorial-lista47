"use client";

import { useEffect, useRef } from "react";
import { armarFilas, TIPO_PUESTO_FONDO, TIPO_PUESTO_HEX, TIPO_PUESTO_LABEL } from "@/lib/ferias";
import type { TipoPuesto } from "@/lib/schema";
import { cx } from "./ui";

export interface PuestoConNombres {
  numero: number;
  tipo: TipoPuesto;
  nombres: string[]; // emprendimientos ubicados en el puesto
}

const CUPO_TEXTO: Record<TipoPuesto, string> = {
  INDIVIDUAL: "Cada número corresponde a un emprendimiento.",
  COMPARTIDO: "Cada número corresponde a dos emprendimientos.",
  PROPIO: "Cada número corresponde a un emprendimiento que lleva su propio gazebo.",
};

/**
 * Croquis armado por la app (sin imagen): un sector por fila, cada gazebo con su número
 * y los emprendimientos asignados. Se desplaza de costado en el celular.
 */
export function CroquisAuto({ puestos, destacado, entrada = "Entrada principal" }: { puestos: PuestoConNombres[]; destacado?: number; entrada?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const filas = armarFilas(puestos);
  const max = Math.max(...filas.map((f) => f.puestos.length), 1);

  // En el celular, llevar a la vista el puesto destacado.
  useEffect(() => {
    if (!destacado) return;
    ref.current?.querySelector(`[data-puesto="${destacado}"]`)?.scrollIntoView({ block: "center", inline: "center" });
  }, [destacado]);

  return (
    <div>
      <div ref={ref} className="overflow-x-auto rounded-2xl border border-linea bg-white p-3 sm:p-4">
        <div className="space-y-5" style={{ minWidth: Math.max(max * 66, 300) }}>
          {filas.map((f) => (
            <section key={f.sector}>
              <p className="mb-1.5 text-center">
                <span className="font-titulo text-lg font-extrabold" style={{ color: TIPO_PUESTO_HEX[f.tipo] }}>SECTOR {f.sector}</span>{" "}
                <span className="text-sm font-semibold text-gris">
                  (del {f.puestos[0].numero} al {f.puestos[f.puestos.length - 1].numero}) · {TIPO_PUESTO_LABEL[f.tipo]}
                </span>
              </p>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${f.puestos.length}, minmax(0, 1fr))` }}>
                {f.puestos.map((p) => (
                  <div
                    key={p.numero}
                    data-puesto={p.numero}
                    className={cx("flex min-h-24 flex-col items-center rounded-t-[40%] rounded-b-md border-2 px-1 pt-1.5 pb-1 text-center", p.numero === destacado && "ring-4 ring-amber-300")}
                    style={{ background: p.numero === destacado ? "#fde68a" : TIPO_PUESTO_FONDO[p.tipo], borderColor: TIPO_PUESTO_HEX[p.tipo] }}
                  >
                    <span className="font-titulo text-xl leading-none font-extrabold" style={{ color: TIPO_PUESTO_HEX[p.tipo] }}>{p.numero}</span>
                    <span className="mt-1 text-[11px] leading-tight font-semibold break-words hyphens-auto text-tinta">
                      {p.nombres.length ? p.nombres.map((n, i) => <span key={i} className="block">{n}</span>) : <span className="text-gris">libre</span>}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {entrada && <p className="text-center font-titulo text-sm font-extrabold tracking-wide text-tinta uppercase">↑ {entrada} ↑</p>}
        </div>
      </div>
      <ul className="mt-2 grid gap-1 text-xs text-gris sm:grid-cols-2">
        {[...new Set(filas.map((f) => f.tipo))].map((t) => (
          <li key={t} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded" style={{ background: TIPO_PUESTO_FONDO[t], border: `2px solid ${TIPO_PUESTO_HEX[t]}` }} />
            <span><b>{TIPO_PUESTO_LABEL[t]}:</b> {CUPO_TEXTO[t]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
