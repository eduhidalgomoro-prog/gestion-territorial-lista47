import Link from "next/link";
import type { ReactNode } from "react";
import { normalizeText } from "@/lib/format";
import { ubicacionLabel } from "@/lib/labels";
import type { Actividad } from "@/lib/schema";
import { formatDate, titleCase } from "@/lib/util";
import { EstadoBadge } from "./actividad-card";
import { IconArtesania, IconBazar, IconGastronomia } from "./feria-ui";
import { IconAprender, IconCalendar, IconCheck, IconClock, IconHilo, IconPin, IconTijera, IconUsers } from "./icons";
import { cx } from "./ui";

/**
 * Centro de gestión de una actividad tradicional (talleres y similares):
 * qué es → cuándo y dónde → estado → cuánta gente → qué hacer ahora.
 * El ícono del rubro se reconoce por palabras del tipo y del nombre: los talleres nuevos funcionan sin cambios.
 */

const RUBROS: { claves: string[]; Icon: (p: { size?: number; className?: string }) => ReactNode; label: string }[] = [
  { claves: ["costura", "crochet", "fieltro", "tejido", "textil", "bordado", "molderia"], Icon: IconHilo, label: "Textil" },
  { claves: ["barber", "peinad", "peluquer", "corte de pelo", "trenza"], Icon: IconTijera, label: "Cabello" },
  { claves: ["maquill", "belleza", "manos", "pies", "unas", "manicur", "pedicur", "cosmet", "estetica"], Icon: IconBazar, label: "Belleza" },
  { claves: ["gastronom", "catering", "cocina", "pasteler", "panader", "reposter", "chocolat"], Icon: IconGastronomia, label: "Gastronomía" },
  { claves: ["evento", "ceremonial", "decoracion"], Icon: IconCalendar, label: "Eventos" },
  { claves: ["manualidad", "artesan", "reciclad", "sahum", "vela", "jabon"], Icon: IconArtesania, label: "Manualidades" },
];

export function rubroDe(a: Pick<Actividad, "tipo" | "nombre">) {
  const t = normalizeText(`${a.nombre} ${a.tipo}`);
  return RUBROS.find((r) => r.claves.some((c) => t.includes(c))) ?? { Icon: IconAprender, label: "Taller" };
}

/** Encabezado: el nombre es lo principal; estado, cuándo y dónde, y el resumen de gente. */
export function TallerEncabezado({ a, estado, numeros }: { a: Actividad; estado: ReactNode; numeros: { inscriptos: number; presentes: number; ausentes: number; pct: number | null } }) {
  const { Icon, label } = rubroDe(a);
  const cuando = a.fecha ? formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "Sin fecha";
  const horario = a.hora_inicio ? `${a.hora_inicio}${a.hora_fin ? ` – ${a.hora_fin}` : ""} h` : "";
  const donde = [a.barrio && titleCase(a.barrio), ubicacionLabel(a), a.lugar].filter(Boolean).join(" · ");
  return (
    <header className="rounded-[28px] bg-white p-5 shadow-[0_1px_3px_rgba(16,105,133,0.06)] ring-1 ring-linea sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-verde-50 text-marca" title={label}>
          <Icon size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold tracking-[0.14em] text-marca uppercase">{a.tipo || "Actividad"}</p>
          <h1 className={cx("font-titulo text-[24px] leading-tight font-extrabold text-petroleo-600 sm:text-3xl", a.estado === "CANCELADA" && "line-through decoration-gris/50")}>{a.nombre}</h1>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <EstadoBadge estado={a.estado} />
        {estado}
      </div>
      <div className="mt-3 space-y-1 text-[15px]">
        <p className="flex items-center gap-2 font-semibold first-letter:uppercase">
          <IconClock size={18} className="shrink-0 text-gris" />
          <span className="first-letter:uppercase">{cuando}{horario && ` · ${horario}`}</span>
        </p>
        {donde && (
          <p className="flex items-start gap-2 text-gris">
            <IconPin size={18} className="mt-0.5 shrink-0" /> {donde}
          </p>
        )}
      </div>
      {/* Resumen compacto de gente: un solo bloque, no cuatro tarjetas. */}
      <dl className="mt-4 grid grid-cols-4 divide-x divide-linea rounded-2xl bg-fondo py-3 text-center">
        {[
          [numeros.inscriptos, "Inscriptos", ""],
          [numeros.presentes, "Presentes", numeros.presentes ? "text-marca" : ""],
          [numeros.ausentes, "Ausentes", "text-gris"],
          [numeros.pct === null ? "—" : `${numeros.pct}%`, "Asistencia", numeros.pct ? "text-marca" : "text-gris"],
        ].map(([v, l, c]) => (
          <div key={String(l)}>
            <dd className={cx("font-titulo text-2xl leading-none font-extrabold tabular-nums sm:text-3xl", String(c))}>{v}</dd>
            <dt className="mt-1 text-[11px] font-bold tracking-wide text-gris uppercase">{l}</dt>
          </div>
        ))}
      </dl>
    </header>
  );
}

/** Acción principal: tomar asistencia (o, si ya se registró, revisarla). */
export function AccionAsistencia({ id, registrada, presentes }: { id: string; registrada: boolean; presentes: number }) {
  return registrada ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-verde-50 px-4 py-3">
      <p className="flex items-center gap-2 font-extrabold text-marca-600"><IconCheck size={22} /> Asistencia registrada · {presentes} presentes</p>
      <Link href={`/actividades/${id}/asistencia`} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 font-bold text-marca-600 ring-1 ring-marca/30 hover:ring-marca">Revisar asistencia</Link>
    </div>
  ) : (
    <Link
      href={`/actividades/${id}/asistencia`}
      className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-marca text-[18px] font-extrabold tracking-wide text-white uppercase shadow-sm transition-transform hover:bg-marca-600 active:scale-[0.99]"
    >
      <IconCheck size={24} /> Tomar asistencia
    </Link>
  );
}

/** Botón secundario de la ficha (más chico y neutro que la acción principal). */
export function AccionSec({ href, Icon, children, externo }: { href: string; Icon: typeof IconUsers; children: ReactNode; externo?: boolean }) {
  const cls = "flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-white px-2 text-[14px] font-bold text-petroleo ring-1 ring-linea transition hover:ring-petroleo active:scale-[0.98]";
  return externo ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}><Icon size={18} className="shrink-0" /> {children}</a>
  ) : (
    <Link href={href} className={cls}><Icon size={18} className="shrink-0" /> {children}</Link>
  );
}
