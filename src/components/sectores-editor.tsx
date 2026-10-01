"use client";

import { useState } from "react";
import { CAPACIDAD, letraSector, TIPO_PUESTO_FONDO, TIPO_PUESTO_HEX, TIPO_PUESTO_LABEL, type SectorFeria } from "@/lib/ferias";
import { TIPOS_PUESTO, type TipoPuesto } from "@/lib/schema";
import { IconPlus, IconX } from "./icons";
import { btn, cx } from "./ui";

/**
 * Sectores de la feria (una fila del croquis cada uno): tipo de gazebo y cantidad.
 * Va dentro de un formulario: manda la lista como JSON en el campo «sectores».
 */
export function SectoresEditor({ inicial }: { inicial: SectorFeria[] }) {
  const [sectores, setSectores] = useState<SectorFeria[]>(inicial.length ? inicial : [{ tipo: "INDIVIDUAL", cantidad: 10 }]);
  const set = (i: number, patch: Partial<SectorFeria>) => setSectores((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  // Número con el que empieza cada sector (los números van de corrido).
  const inicios = sectores.map((_, i) => 1 + sectores.slice(0, i).reduce((n, x) => n + (x.cantidad || 0), 0));
  const total = sectores.reduce((n, x) => n + (x.cantidad || 0), 0);
  const lugares = sectores.reduce((n, x) => n + (x.cantidad || 0) * CAPACIDAD[x.tipo], 0);

  return (
    <div className="mb-4">
      <input type="hidden" name="sectores" value={JSON.stringify(sectores)} />
      <ul className="space-y-2">
        {sectores.map((x, i) => {
          const rango = x.cantidad > 0 ? `${inicios[i]}–${inicios[i] + x.cantidad - 1}` : "—";
          return (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border-2 p-2" style={{ borderColor: TIPO_PUESTO_HEX[x.tipo], background: TIPO_PUESTO_FONDO[x.tipo] }}>
              <span className="w-24 shrink-0 font-titulo font-extrabold" style={{ color: TIPO_PUESTO_HEX[x.tipo] }}>
                Sector {letraSector(i)}
                <span className="block text-xs font-semibold text-gris">N° {rango}</span>
              </span>
              <select
                aria-label={`Tipo de gazebo del sector ${letraSector(i)}`}
                value={x.tipo}
                onChange={(e) => set(i, { tipo: e.target.value as TipoPuesto })}
                className="h-11 min-w-0 flex-1 rounded-lg border border-linea bg-white px-2 text-[15px] font-semibold"
              >
                {TIPOS_PUESTO.map((t) => <option key={t} value={t}>{TIPO_PUESTO_LABEL[t]}{t === "COMPARTIDO" ? " (2 por gazebo)" : ""}</option>)}
              </select>
              <input
                type="number"
                min={1}
                max={200}
                inputMode="numeric"
                aria-label={`Cantidad de gazebos del sector ${letraSector(i)}`}
                value={x.cantidad || ""}
                onChange={(e) => set(i, { cantidad: Math.max(0, Number(e.target.value) || 0) })}
                className="h-11 w-20 rounded-lg border border-linea bg-white px-2 text-center text-[15px] font-bold"
              />
              <button
                type="button"
                onClick={() => setSectores((s) => s.filter((_, j) => j !== i))}
                disabled={sectores.length === 1}
                className="rounded-lg p-2 text-gris hover:bg-white disabled:opacity-30"
                aria-label={`Quitar sector ${letraSector(i)}`}
              >
                <IconX size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setSectores((s) => [...s, { tipo: s[s.length - 1]?.tipo ?? "INDIVIDUAL", cantidad: 8 }])} className={cx(btn("secundario", "sm"))}>
          <IconPlus size={16} /> Agregar sector
        </button>
        <p className="text-sm font-semibold text-gris">
          {total} gazebos · entran {lugares} feriantes
        </p>
      </div>
    </div>
  );
}
