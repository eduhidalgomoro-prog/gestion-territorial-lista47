import Link from "next/link";
import { ESTADO_COLOR, zonaLabel } from "@/lib/labels";
import { formatDiaMes, titleCase } from "@/lib/format";
import type { Actividad } from "@/lib/schema";
import { Badge, cx } from "./ui";

/** Tarjeta de actividad (en lugar de una fila de planilla con 35 columnas). */
export function ActividadCard({ a, conteo, compacta }: { a: Actividad; conteo?: { inscriptos: number; presentes: number }; compacta?: boolean }) {
  return (
    <Link
      href={`/actividades/${a.id}`}
      className="group block rounded-2xl border border-linea bg-white p-4 transition-colors hover:border-petroleo focus-visible:border-petroleo"
    >
      <div className="flex items-start gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-petroleo-50 py-2 text-petroleo-600">
          {a.fecha ? (
            <>
              <span className="font-titulo text-xl leading-none font-extrabold">{formatDiaMes(a.fecha).split(" ")[0]}</span>
              <span className="mt-0.5 text-[11px] font-bold">{formatDiaMes(a.fecha).split(" ")[1]}</span>
            </>
          ) : (
            <span className="text-xs font-bold">S/F</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {a.tipo && <p className="text-[11px] font-bold tracking-[0.12em] text-marca uppercase">{a.tipo}</p>}
          <p className="font-titulo leading-snug font-bold text-tinta group-hover:text-petroleo">{a.nombre}</p>
          <p className="mt-0.5 text-sm text-gris">
            {a.hora_inicio && `${a.hora_inicio}${a.hora_fin ? `–${a.hora_fin}` : ""} · `}
            {zonaLabel(a.zona)}
            {a.barrio && ` · ${titleCase(a.barrio)}`}
          </p>
          {!compacta && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge color={ESTADO_COLOR[a.estado]}>{a.estado}</Badge>
              {conteo && (conteo.inscriptos > 0 || a.estado === "REALIZADA") && (
                <span className={cx("text-sm font-semibold text-tinta")}>
                  {conteo.inscriptos} inscriptos{a.estado === "REALIZADA" || conteo.presentes ? ` · ${conteo.presentes} asistentes` : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
