import Link from "next/link";
import { ESTADO_COLOR, ESTADO_HEX, ubicacionLabel } from "@/lib/labels";
import { formatDate, formatDiaMes, titleCase } from "@/lib/format";
import type { Actividad, EstadoActividad } from "@/lib/schema";
import { IconClock, IconPin, IconUsers } from "./icons";
import { Badge, cx } from "./ui";

/** Estado con punto de color y texto (nunca solo color). */
export function EstadoBadge({ estado }: { estado: EstadoActividad }) {
  return (
    <Badge color={ESTADO_COLOR[estado]}>
      <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: ESTADO_HEX[estado] }} aria-hidden />
      {estado}
    </Badge>
  );
}

/**
 * Tarjeta de actividad, pensada para recorrer 20 o 30 de un vistazo:
 * fecha a la izquierda · tipo chico · nombre (protagonista, hasta 2 líneas) · horario y lugar · estado e inscriptos abajo.
 * Todas miden parecido: los textos largos se recortan (el detalle completo está en la ficha).
 */
export function ActividadCard({ a, conteo, compacta }: { a: Actividad; conteo?: { inscriptos: number; presentes: number }; compacta?: boolean }) {
  const [dia, mes] = a.fecha ? formatDiaMes(a.fecha).split(" ") : ["", ""];
  const diaSemana = a.fecha ? formatDate(a.fecha, { weekday: "short" }).replace(".", "").toUpperCase() : "";
  const horario = a.hora_inicio ? `${a.hora_inicio}${a.hora_fin ? ` – ${a.hora_fin}` : ""} h` : "Horario a confirmar";
  const lugar = [ubicacionLabel(a), a.barrio && titleCase(a.barrio), a.lugar].filter(Boolean).join(" · ");
  const inscriptos = conteo?.inscriptos ?? 0;
  const tachada = a.estado === "CANCELADA";
  return (
    <Link
      href={`/actividades/${a.id}`}
      className="group flex h-full flex-col rounded-2xl border border-linea bg-white transition-[border-color,box-shadow] hover:border-petroleo hover:shadow-sm focus-visible:border-petroleo"
    >
      <div className="flex flex-1 items-start gap-3 p-4 pb-3">
        <div className={cx("flex w-14 shrink-0 flex-col items-center rounded-xl py-2", tachada ? "bg-fondo text-gris" : "bg-petroleo-50 text-petroleo-600")}>
          {a.fecha ? (
            <>
              <span className="text-[10px] leading-none font-bold tracking-wide opacity-80">{diaSemana}</span>
              <span className="mt-1 font-titulo text-[22px] leading-none font-extrabold">{dia}</span>
              <span className="mt-0.5 text-[11px] leading-none font-bold">{mes}</span>
            </>
          ) : (
            <span className="py-2 text-xs font-bold">S/F</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {a.tipo && <p className="truncate text-[11px] font-bold tracking-[0.12em] text-marca uppercase">{a.tipo}</p>}
          <p className={cx("line-clamp-2 font-titulo text-[17px] leading-snug font-bold text-tinta group-hover:text-petroleo", tachada && "line-through decoration-gris/60")} title={a.nombre}>
            {a.nombre}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gris">
            <IconClock size={15} className="shrink-0" /> <span className="truncate">{horario}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gris" title={lugar}>
            <IconPin size={15} className="shrink-0" /> <span className="truncate">{lugar}</span>
          </p>
        </div>
      </div>
      {!compacta && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-linea px-4 py-2.5">
          <EstadoBadge estado={a.estado} />
          <span className={cx("inline-flex items-center gap-1.5 text-sm font-semibold", inscriptos ? "text-tinta" : "text-gris")}>
            <IconUsers size={16} />
            {inscriptos} {inscriptos === 1 ? "inscripto" : "inscriptos"}
            {conteo && (a.estado === "REALIZADA" || conteo.presentes > 0) && <span className="font-normal text-gris">· {conteo.presentes} asist.</span>}
          </span>
        </div>
      )}
    </Link>
  );
}
