"use client";

import { useState } from "react";
import { Columnas, type Dato } from "./charts";
import { cx } from "./ui";

/**
 * Evolución mensual con una métrica por vez (Actividades / Participación), en lugar de muchas series juntas.
 * Si no hay datos en ningún mes, muestra un estado vacío en lugar de columnas en cero.
 */
export function EvolucionMensual({ actividades, participacion }: { actividades: Dato[]; participacion: Dato[] }) {
  const [vista, setVista] = useState<"actividades" | "participacion">("actividades");
  const data = vista === "actividades" ? actividades : participacion;
  const vacio = data.every((d) => !d.value && !d.value2);
  return (
    <div>
      <div className="mb-3 inline-flex rounded-full bg-fondo p-1" role="tablist" aria-label="Qué mostrar">
        {([["actividades", "Actividades"], ["participacion", "Participación"]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={vista === id}
            onClick={() => setVista(id)}
            className={cx("min-h-9 rounded-full px-4 text-sm font-bold", vista === id ? "bg-white text-petroleo shadow-sm" : "text-gris")}
          >
            {label}
          </button>
        ))}
      </div>
      {vacio ? (
        <p className="py-6 text-center text-sm text-gris">Todavía no hay datos suficientes para mostrar esta estadística.</p>
      ) : vista === "actividades" ? (
        <Columnas data={actividades} leyenda={["Programadas", "Realizadas"]} colores={["#9bb8c4", "#106985"]} />
      ) : (
        <Columnas data={participacion} leyenda={["Inscriptos", "Asistentes"]} colores={["#9bb8c4", "#3f742c"]} />
      )}
    </div>
  );
}
