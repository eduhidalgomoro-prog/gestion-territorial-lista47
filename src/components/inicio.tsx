import Link from "next/link";
import type { ReactNode } from "react";
import type { Cumplimiento, Indicadores } from "@/lib/domain/metricas";
import { estadoZona, personasDelMes, type Destacado } from "@/lib/domain/resumen";
import { formatMoney, formatNumber } from "@/lib/format";
import { zonaLabel } from "@/lib/labels";
import { IconAlert, IconBaja, IconCalendar, IconCash, IconCheck, IconPin, IconSube, IconTarget, IconUserPlus, IconUsers } from "./icons";
import { cx } from "./ui";

/**
 * Piezas del Inicio: pensadas para entender el mes en 5 segundos.
 * Verde = logro/avance · ámbar = pendiente · rojo = solo alertas reales. Siempre con texto además del color.
 */

/** Tarjeta protagonista: el mes en tres frases. */
export function ResumenMes({ titulo, ind, zonas, conActividades = true }: {
  titulo: string; // «Octubre 2026»
  ind: Indicadores;
  zonas: Cumplimiento[];
  conActividades?: boolean; // Agenda no ve el objetivo ni el estado de las actividades
}) {
  const personas = personasDelMes(ind);
  const cumplidas = zonas.filter((z) => z.cantidad >= z.objetivo).length;
  const todas = zonas.length > 0 && cumplidas === zonas.length;
  return (
    <section aria-label={`Resumen de ${titulo}`} className="bg-institucional relative overflow-hidden rounded-[28px] p-5 text-white shadow-md sm:p-7">
      <svg className="pointer-events-none absolute -right-10 -bottom-16 h-64 w-64 text-white/10" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="48" fill="currentColor" />
      </svg>
      <p className="relative text-sm font-bold tracking-[0.18em] text-white/80 uppercase">{titulo}</p>
      <div className="relative mt-3 grid gap-5 sm:grid-cols-2">
        {conActividades && (
          <Grande valor={formatNumber(ind.programadas)} texto={ind.programadas === 1 ? "actividad programada" : "actividades programadas"} Icon={IconCalendar} />
        )}
        <Grande valor={formatNumber(personas)} texto={personas === 1 ? "persona inscripta" : "personas inscriptas"} Icon={IconUsers} />
      </div>
      {conActividades && zonas.length > 0 && (
        <p className={cx("relative mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-bold", todas ? "bg-white text-marca" : "bg-white/15 text-white ring-1 ring-white/30")}>
          <span className={cx("flex size-6 items-center justify-center rounded-full", todas ? "bg-verde text-white" : "bg-amber-300 text-tinta")}>
            {todas ? <IconCheck size={15} /> : <IconTarget size={15} />}
          </span>
          {zonas.length === 1
            ? todas ? "Tu zona alcanzó el objetivo mensual" : `Tu zona: ${zonas[0].cantidad} de ${zonas[0].objetivo} actividades del objetivo`
            : `${cumplidas} de ${zonas.length} zonas alcanzaron el objetivo mensual`}
        </p>
      )}
    </section>
  );
}

function Grande({ valor, texto, Icon }: { valor: string; texto: string; Icon: typeof IconUsers }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
        <Icon size={26} />
      </span>
      <p className="leading-none">
        <span className="font-titulo text-5xl font-extrabold tracking-tight sm:text-6xl">{valor}</span>
        <span className="mt-1 block text-[17px] font-semibold text-white/90">{texto}</span>
      </p>
    </div>
  );
}

const TONO: Record<Destacado["tono"], { caja: string; icono: string; Icon: typeof IconCheck }> = {
  logro: { caja: "bg-verde-50", icono: "bg-verde text-white", Icon: IconCheck },
  pendiente: { caja: "bg-alerta-50", icono: "bg-amber-400 text-tinta", Icon: IconTarget },
  alerta: { caja: "bg-peligro-50", icono: "bg-peligro text-white", Icon: IconAlert },
  info: { caja: "bg-petroleo-50", icono: "bg-petroleo text-white", Icon: IconUsers },
};

/** «Lo más importante del mes»: 2 o 3 frases generadas con reglas. */
const ICONO_EXTRA = { sube: IconSube, baja: IconBaja, personas: IconUsers, lugar: IconPin } as const;

export function Destacados({ items, enColumna, titulo = "Lo más importante del mes", columnas = 3 }: { items: Destacado[]; enColumna?: boolean; titulo?: string; columnas?: 2 | 3 }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="destacados">
      <h2 id="destacados" className="mb-2 text-lg font-bold">{titulo}</h2>
      <ul className={cx("grid gap-2", !enColumna && (columnas === 2 ? "md:grid-cols-2" : "md:grid-cols-3"))}>
        {items.map((d, i) => {
          const t = TONO[d.tono];
          const Icono = d.icono ? ICONO_EXTRA[d.icono] : t.Icon;
          return (
            <li key={i} className={cx("flex items-start gap-3 rounded-2xl p-3.5", t.caja)}>
              <span className={cx("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", t.icono)}><Icono size={16} /></span>
              <p className="text-[15px] leading-snug font-semibold">{d.texto}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Avance por zonas: barra de progreso + texto («1 de 2 — Falta 1»). */
export function AvanceZonas({ data, anio, mes }: { data: Cumplimiento[]; anio: number; mes: number }) {
  return (
    <section aria-labelledby="avance" className="rounded-3xl bg-white p-4 ring-1 ring-linea sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="avance" className="text-lg font-bold">{data.length === 1 ? "Avance de tu zona" : "Avance por zonas"}</h2>
        <span className="text-sm text-gris">Objetivo: {data[0]?.objetivo ?? 2} actividades por mes{data.length > 1 ? " en cada zona de Capital" : ""}</span>
      </div>
      <ul className="space-y-4">
        {data.map((z) => {
          const e = estadoZona(z);
          const pct = z.objetivo > 0 ? Math.min(100, Math.round((z.cantidad / z.objetivo) * 100)) : 100;
          return (
            <li key={z.zona}>
              <Link href={`/actividades?zona=${z.zona}&mes=${mes}&anio=${anio}`} className="group block">
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-titulo font-bold group-hover:text-petroleo">{zonaLabel(z.zona)}</span>
                  <span className="text-[15px]">
                    <b className="tabular-nums">{z.cantidad} de {z.objetivo}</b>
                    <span className={cx("ml-2 font-bold", e.tono === "logro" ? "text-marca" : "text-alerta")}>
                      {e.tono === "logro" ? "✓ " : ""}{e.texto}
                    </span>
                  </span>
                </div>
                <div className="h-3.5 overflow-hidden rounded-full bg-fondo ring-1 ring-linea" role="img" aria-label={`${zonaLabel(z.zona)}: ${z.cantidad} de ${z.objetivo}. ${e.texto}`}>
                  <div className={cx("h-full rounded-full", e.tono === "logro" ? "bg-verde" : "bg-amber-400")} style={{ width: `${Math.max(pct, z.cantidad ? 6 : 0)}%` }} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Grupo({ titulo, Icon, children, className }: { titulo: string; Icon: typeof IconUsers; children: ReactNode; className?: string }) {
  return (
    <section aria-label={titulo} className={cx("p-4 sm:p-5", className)}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-gris uppercase">
        <span className="flex size-7 items-center justify-center rounded-full bg-petroleo-50 text-petroleo"><Icon size={16} /></span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Numero({ valor, label, tono = "normal", grande }: { valor: ReactNode; label: string; tono?: "normal" | "logro" | "pendiente"; grande?: boolean }) {
  return (
    <div>
      <p className={cx("font-titulo leading-none font-extrabold tracking-tight tabular-nums", grande ? "text-4xl" : "text-[28px]", tono === "logro" && "text-marca", tono === "pendiente" && "text-alerta")}>{valor}</p>
      <p className="mt-1 text-[13px] font-semibold text-gris">{label}</p>
    </div>
  );
}

/** Indicadores agrupados: Actividad · Participación · Alcance (en un solo panel, no tarjetas iguales). */
export function GruposIndicadores({ ind, conActividades = true, conAlcance = true }: { ind: Indicadores; conActividades?: boolean; conAlcance?: boolean }) {
  const bajas = ind.suspendidas + ind.canceladas;
  const personas = personasDelMes(ind);
  const pctNuevas = personas ? Math.round((ind.personasNuevas / personas) * 100) : 0;
  const columnas = 1 + (conActividades ? 1 : 0) + (conAlcance ? 1 : 0);
  return (
    <div className={cx("grid overflow-hidden rounded-3xl bg-white ring-1 ring-linea divide-y divide-linea md:divide-x md:divide-y-0", columnas === 3 ? "md:grid-cols-3" : columnas === 2 ? "md:grid-cols-2" : "")}>
      {conActividades && (
        <Grupo titulo="Actividad" Icon={IconCalendar}>
          <div className="grid grid-cols-3 gap-3">
            <Numero valor={ind.programadas} label="Programadas" grande />
            <Numero valor={ind.realizadas} label="Realizadas" tono={ind.realizadas ? "logro" : "normal"} grande />
            <Numero valor={bajas} label="Suspendidas / canceladas" tono={bajas ? "pendiente" : "normal"} grande />
          </div>
          {ind.borradores > 0 && <p className="mt-3 text-sm text-gris">Además, {ind.borradores} en borrador.</p>}
        </Grupo>
      )}
      <Grupo titulo="Participación" Icon={IconUsers}>
        <div className="grid grid-cols-3 gap-3">
          <Numero valor={formatNumber(ind.inscriptos)} label="Inscriptos" grande />
          <Numero valor={formatNumber(ind.asistentes)} label="Asistentes" tono={ind.asistentes ? "logro" : "normal"} grande />
          <Numero valor={`${ind.pctAsistencia}%`} label="Asistencia" grande />
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-fondo" role="img" aria-label={`${ind.pctAsistencia}% de asistencia en las actividades realizadas`}>
          <div className="h-full rounded-full bg-verde" style={{ width: `${ind.pctAsistencia}%` }} />
        </div>
        <p className="mt-1 text-xs text-gris">% de asistencia en las actividades ya realizadas</p>
      </Grupo>
      {conAlcance && <Grupo titulo="Alcance" Icon={IconUserPlus}>
        <div className="grid grid-cols-2 gap-3">
          <Numero valor={formatNumber(ind.personasNuevas)} label="Personas nuevas" tono={ind.personasNuevas ? "logro" : "normal"} grande />
          <Numero valor={formatNumber(ind.personasRecurrentes)} label="Personas recurrentes" grande />
        </div>
        {personas > 0 && (
          <>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-petroleo-50" role="img" aria-label={`${pctNuevas}% de las personas son nuevas`}>
              <div className="h-full bg-verde" style={{ width: `${pctNuevas}%` }} />
            </div>
            <p className="mt-1 text-xs text-gris">{pctNuevas}% participa por primera vez</p>
          </>
        )}
      </Grupo>}
    </div>
  );
}

/** Costos: bloque secundario, más discreto. */
export function BloqueCostos({ estimado, real }: { estimado: number; real: number }) {
  return (
    <section aria-label="Costos del mes" className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl bg-white/60 px-4 py-3 ring-1 ring-linea">
      <span className="flex items-center gap-2 text-sm font-bold tracking-wide text-gris uppercase"><IconCash size={18} /> Costos del mes</span>
      <span className="text-[15px]"><span className="text-gris">Estimado</span> <b className="tabular-nums">{formatMoney(estimado)}</b></span>
      <span className="text-[15px]"><span className="text-gris">Real</span> <b className="tabular-nums">{real ? formatMoney(real) : "—"}</b></span>
    </section>
  );
}
