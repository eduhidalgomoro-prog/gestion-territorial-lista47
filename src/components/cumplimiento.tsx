import Link from "next/link";
import type { Cumplimiento } from "@/lib/domain/metricas";
import { zonaLabel } from "@/lib/labels";
import { Badge, cx } from "./ui";

/** «ZONA NORTE — 1 / 2»: indicador visual del objetivo mensual (no bloquea nada). */
export function CumplimientoZonas({ data, anio, mes }: { data: Cumplimiento[]; anio: number; mes: number }) {
  return (
    <section className="rounded-2xl border border-linea bg-white p-4 sm:p-5" aria-labelledby="cumpl">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="cumpl" className="text-base font-bold">{data.length === 1 ? "Objetivo mensual de tu zona" : "Objetivo mensual por zona"}</h2>
        <span className="text-xs font-semibold text-gris">mínimo {data[0]?.objetivo ?? 2} por zona</span>
      </div>
      <ul className="divide-y divide-linea">
        {data.map((z) => {
          const puntos = Math.max(z.objetivo, z.cantidad);
          return (
            <li key={z.zona}>
              <Link href={`/actividades?zona=${z.zona}&mes=${mes}&anio=${anio}`} className="flex items-center gap-3 py-3 hover:text-petroleo">
                <span className="w-28 shrink-0 font-titulo text-sm font-bold whitespace-nowrap uppercase">{zonaLabel(z.zona)}</span>
                <span className="flex flex-1 flex-wrap gap-1" aria-hidden>
                  {Array.from({ length: Math.min(puntos, 10) }, (_, i) => (
                    <span
                      key={i}
                      className={cx("size-3.5 rounded-full", i < z.cantidad ? (z.ok ? "bg-verde" : "bg-alerta") : "border-2 border-linea bg-white")}
                    />
                  ))}
                </span>
                <span className="font-titulo text-lg font-extrabold tabular-nums">
                  {z.cantidad} / {z.objetivo}
                </span>
                {z.ok ? <Badge color="verde">✓ Cumple</Badge> : <Badge color="naranja">Falta {z.objetivo - z.cantidad}</Badge>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
