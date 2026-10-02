import Link from "next/link";
import type { ReactNode } from "react";
import { type ResumenHuellas } from "@/lib/huellas";
import { ubicacionLabel } from "@/lib/labels";
import type { Actividad } from "@/lib/schema";
import { formatDate, titleCase } from "@/lib/util";
import { IconArrowLeft, IconGato, IconHuella, IconPerro, IconPlus, IconUsers, IconVacuna } from "./icons";
import { cx } from "./ui";

/**
 * Identidad de Marcando Huellas dentro de Gestión Territorial: verde, huellas sutiles,
 * perro y gato como detalles. Botón principal: «Registrar atención».
 */

export function MarcandoHuellasHeader({ a, atenciones, puedeRegistrar, volver, children }: {
  a: Actividad;
  atenciones: number;
  puedeRegistrar: boolean;
  volver?: { href: string; label: string };
  children?: ReactNode;
}) {
  const cuando = [a.fecha && formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }), a.hora_inicio && `${a.hora_inicio}${a.hora_fin ? ` a ${a.hora_fin}` : ""} h`].filter(Boolean).join(" · ");
  const donde = [ubicacionLabel(a), a.barrio && `Barrio ${titleCase(a.barrio)}`, a.lugar].filter(Boolean).join(" · ");
  return (
    <header className="huellas-patron mb-4 overflow-hidden rounded-[28px] p-5 ring-1 ring-linea sm:p-7">
      {volver && (
        <Link href={volver.href} className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-sm font-bold text-petroleo ring-1 ring-linea hover:bg-white">
          <IconArrowLeft size={16} /> {volver.label}
        </Link>
      )}
      <p className="flex items-center gap-2 text-sm font-extrabold tracking-[0.16em] text-marca uppercase">
        <span className="flex size-8 items-center justify-center rounded-full bg-marca text-white"><IconHuella size={18} /></span>
        Marcando Huellas
      </p>
      <h1 className="mt-2 font-titulo text-2xl leading-tight font-extrabold text-petroleo-600 sm:text-3xl">{a.nombre}</h1>
      {cuando && <p className="mt-1 text-[16px] font-semibold first-letter:uppercase">{cuando}</p>}
      {donde && <p className="text-[15px] text-gris">{donde}</p>}
      {children}
      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
        {puedeRegistrar && a.estado !== "CANCELADA" && (
          <Link
            href={`/actividades/${a.id}/atenciones/nueva`}
            className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-marca px-6 text-[18px] font-extrabold text-white uppercase shadow-sm hover:bg-marca-600 active:scale-[0.99]"
          >
            <IconPlus size={24} /> Registrar atención
          </Link>
        )}
        <Link href={`/actividades/${a.id}/atenciones`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-marca/30 bg-white px-5 font-bold text-marca-600">
          Ver atenciones <span className="rounded-full bg-verde-50 px-2.5 py-0.5 text-sm">{atenciones}</span>
        </Link>
      </div>
    </header>
  );
}

function Num({ valor, label, Icon, grande }: { valor: number; label: string; Icon?: typeof IconPerro; grande?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {Icon && <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-verde-50 text-marca"><Icon size={24} /></span>}
      <p className="leading-none">
        <span className={cx("font-titulo font-extrabold tracking-tight tabular-nums", grande ? "text-5xl" : "text-3xl")}>{valor}</span>
        <span className="mt-1 block text-[14px] font-semibold text-gris">{label}</span>
      </p>
    </div>
  );
}

/** Resumen del operativo (o de varios, en Estadísticas): Personas · Animales · Atenciones · Castración. */
export function MarcandoHuellasStats({ r, conOperativos }: { r: ResumenHuellas; conOperativos?: boolean }) {
  if (!r.atenciones) {
    return <p className="rounded-2xl bg-white px-4 py-6 text-center text-[15px] text-gris ring-1 ring-linea">Todavía no hay atenciones registradas.</p>;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
      {/* Protagonista: animales atendidos */}
      <section className="rounded-3xl bg-white p-5 ring-1 ring-linea">
        <p className="text-xs font-bold tracking-wide text-gris uppercase">Animales atendidos</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-4">
          <Num valor={r.animales} label={r.animales === 1 ? "animal" : "animales"} Icon={IconHuella} grande />
          <Num valor={r.perros} label={r.perros === 1 ? "perro" : "perros"} Icon={IconPerro} />
          <Num valor={r.gatos} label={r.gatos === 1 ? "gato" : "gatos"} Icon={IconGato} />
        </div>
        <div className="mt-4 border-t border-linea pt-4">
          <Num valor={r.responsables} label={r.responsables === 1 ? "responsable atendido" : "responsables atendidos"} Icon={IconUsers} />
          {conOperativos && <p className="mt-2 text-sm text-gris">En {r.operativos} {r.operativos === 1 ? "operativo" : "operativos"} con atenciones.</p>}
        </div>
      </section>
      <div className="grid gap-3">
        <section className="rounded-3xl bg-white p-5 ring-1 ring-linea">
          <p className="mb-2 text-xs font-bold tracking-wide text-gris uppercase">Prestaciones</p>
          <div className="grid grid-cols-2 gap-4">
            <Num valor={r.antirrabicas} label={r.antirrabicas === 1 ? "antirrábica" : "antirrábicas"} Icon={IconVacuna} />
            <Num valor={r.desparasitaciones} label={r.desparasitaciones === 1 ? "desparasitación" : "desparasitaciones"} Icon={IconHuella} />
          </div>
        </section>
        <section className="rounded-3xl bg-white p-5 ring-1 ring-linea">
          <p className="mb-2 text-xs font-bold tracking-wide text-gris uppercase">Castración</p>
          <div className="grid grid-cols-3 gap-3">
            <Num valor={r.castrados} label="castrados" />
            <Num valor={r.noCastrados} label="no castrados" />
            <Num valor={r.interesados} label="con interés en castrar" />
          </div>
          {r.animales > 0 && (
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-fondo" role="img" aria-label={`${r.castrados} castrados de ${r.animales}`}>
              <div className="h-full bg-marca" style={{ width: `${(r.castrados / r.animales) * 100}%` }} />
              <div className="h-full bg-amber-300" style={{ width: `${(r.interesados / r.animales) * 100}%` }} />
            </div>
          )}
          <p className="mt-1.5 text-xs text-gris">
            Perros: {r.perrosCastrados} castrados · {r.perrosNoCastrados} sin castrar. Gatos: {r.gatosCastrados} castrados · {r.gatosNoCastrados} sin castrar.
          </p>
        </section>
      </div>
    </div>
  );
}
