import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * Gráficos simples y livianos (HTML/CSS, sin librerías): se leen bien en el celular
 * y no hace falta descargar nada extra.
 */

export interface Dato {
  label: string;
  value: number;
  value2?: number;
  color?: string;
}

/** Barras horizontales: una categoría por fila, con el número al final. */
export function Barras({ data, format = (n) => String(n), color = "#106985", max: maxProp, vacio = "Sin datos para este período." }: {
  data: Dato[];
  format?: (n: number) => string;
  color?: string;
  max?: number;
  vacio?: string;
}) {
  if (!data.length) return <p className="py-4 text-sm text-gris">{vacio}</p>;
  const max = maxProp ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-semibold text-tinta">{d.label}</span>
            <span className="shrink-0 font-bold tabular-nums">{format(d.value)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-fondo">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: d.color ?? color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Dos valores por categoría (ej. inscriptos vs. asistentes). */
export function BarrasDobles({ data, leyenda, format = (n) => String(n), colores = ["#9bb8c4", "#3f742c"] }: {
  data: Dato[];
  leyenda: [string, string];
  format?: (n: number) => string;
  colores?: [string, string];
}) {
  if (!data.length || data.every((d) => !d.value && !d.value2)) return <p className="py-4 text-sm text-gris">Sin datos para este período.</p>;
  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.value2 ?? 0]));
  return (
    <div>
      <Leyenda items={[{ label: leyenda[0], color: colores[0] }, { label: leyenda[1], color: colores[1] }]} />
      <ul className="mt-3 space-y-3">
        {data.map((d) => (
          <li key={d.label}>
            <p className="mb-1 text-sm font-semibold">{d.label}</p>
            {[d.value, d.value2 ?? 0].map((v, i) => (
              <div key={i} className="mb-1 flex items-center gap-2">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-fondo">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(v ? 2 : 0, (v / max) * 100)}%`, background: colores[i] }} />
                </div>
                <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums">{format(v)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Columnas por mes (evolución). Muestra dos series lado a lado. */
export function Columnas({ data, leyenda, colores = ["#106985", "#66ba47"] }: { data: Dato[]; leyenda: [string, string?]; colores?: [string, string] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.value2 ?? 0]));
  return (
    <div>
      <Leyenda items={[{ label: leyenda[0], color: colores[0] }, ...(leyenda[1] ? [{ label: leyenda[1], color: colores[1] }] : [])]} />
      <div className="mt-3 flex h-40 items-end gap-2" role="img" aria-label={`Evolución: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
        {data.map((d) => (
          <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <div className="flex h-full w-full items-end justify-center gap-0.5">
              <Col value={d.value} max={max} color={colores[0]} />
              {d.value2 !== undefined && <Col value={d.value2} max={max} color={colores[1]} />}
            </div>
            <span className="mt-1 truncate text-[11px] font-semibold text-gris">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Col({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex h-full w-full max-w-7 flex-col items-center justify-end">
      <span className="mb-0.5 text-[10px] font-bold tabular-nums">{value || ""}</span>
      <div className="w-full rounded-t-md" style={{ height: `${(value / max) * 85}%`, minHeight: value ? 3 : 0, background: color }} />
    </div>
  );
}

export function Leyenda({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs font-semibold text-gris">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: i.color }} /> {i.label}
        </span>
      ))}
    </div>
  );
}

export function ChartCard({ title, children, className, action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cx("rounded-2xl border border-linea bg-white p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
