import { MESES } from "@/lib/format";
import { FiltroSelect, FiltrosForm } from "./filtros";

/** Selector MES / AÑO (por defecto el mes actual). `todoElAnio` agrega la opción de ver el año completo. */
export function SelectorPeriodo({ action, anio, mes, extra, todoElAnio }: {
  action: string;
  anio: number;
  mes: number;
  extra?: Record<string, string>;
  todoElAnio?: boolean;
}) {
  const anios = [anio - 1, anio, anio + 1].filter((a, i, arr) => arr.indexOf(a) === i);
  if (!anios.includes(2026)) anios.unshift(2026);
  return (
    <FiltrosForm action={action} className="grid grid-cols-2 gap-2 sm:flex">
      <FiltroSelect
        name="mes"
        label="Mes"
        value={mes}
        options={[...(todoElAnio ? [[0, "Todo el año"] as const] : []), ...MESES.map((m, i) => [i + 1, m] as const)]}
      />
      <FiltroSelect name="anio" label="Año" value={anio} options={[...new Set(anios)].sort().map((a) => [a, String(a)] as const)} />
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </FiltrosForm>
  );
}
