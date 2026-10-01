import type { ReactNode } from "react";
import type { Indicadores } from "@/lib/domain/metricas";
import { compararIndicador, personasDelMes } from "@/lib/domain/resumen";
import { formatMoney, formatNumber } from "@/lib/format";
import { Barras, type Dato } from "./charts";
import { IconBaja, IconCalendar, IconCash, IconCheck, IconPin, IconSube, IconUserPlus, IconUsers } from "./icons";
import { cx } from "./ui";

/**
 * Piezas de la pantalla Estadísticas (pensadas primero para el celular):
 * bloques plegables, barras con «Ver todos», comparación en tarjetas y estados vacíos amables.
 */

export const SIN_DATOS = "Todavía no hay datos suficientes para mostrar esta estadística.";

export function Vacio({ children = SIN_DATOS }: { children?: ReactNode }) {
  return <p className="rounded-xl bg-fondo px-4 py-5 text-center text-sm text-gris">{children}</p>;
}

/** Uno de los grandes bloques (Territorio, Participación…): título claro y se puede plegar. */
export function Bloque({ id, titulo, resumen, abierto = true, children }: { id: string; titulo: string; resumen?: ReactNode; abierto?: boolean; children: ReactNode }) {
  return (
    <details id={id} open={abierto} className="group/bloque scroll-mt-20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl py-2 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-titulo text-xl font-extrabold tracking-tight">{titulo}</span>
          {resumen && <span className="block text-sm text-gris">{resumen}</span>}
        </span>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-petroleo ring-1 ring-linea transition-transform group-open/bloque:rotate-180" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </summary>
      <div className="mt-2 grid gap-4 lg:grid-cols-2">{children}</div>
    </details>
  );
}

/** Tarjeta de un gráfico dentro de un bloque. */
export function Tarjeta({ titulo, nota, children, ancha, className }: { titulo: string; nota?: ReactNode; children: ReactNode; ancha?: boolean; className?: string }) {
  return (
    <section className={cx("min-w-0 rounded-2xl bg-white p-4 ring-1 ring-linea sm:p-5", ancha && "lg:col-span-2", className)}>
      <h3 className="text-base font-bold">{titulo}</h3>
      {nota && <p className="mt-0.5 text-sm text-gris">{nota}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Barras horizontales con los primeros N y «Otros»; el resto se ve con «Ver todos». */
export function TopBarras({ data, n = 5, color, verTodos = "Ver todos", format }: { data: Dato[]; n?: number; color?: string; verTodos?: string; format?: (v: number) => string }) {
  const con = data.filter((d) => d.value > 0);
  if (!con.length) return <Vacio />;
  const top = con.slice(0, n);
  const resto = con.slice(n);
  const otros = resto.reduce((s, d) => s + d.value, 0);
  const max = Math.max(...con.map((d) => d.value));
  return (
    <div>
      <Barras data={top} color={color} max={max} format={format} />
      {resto.length > 0 && (
        <details className="group/otros mt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl bg-fondo px-3 py-2 text-sm">
            <span className="font-semibold text-gris">Otros ({resto.length}) · <b className="text-tinta">{format ? format(otros) : otros}</b></span>
            <span className="font-bold text-petroleo group-open/otros:hidden">{verTodos}</span>
            <span className="hidden font-bold text-petroleo group-open/otros:inline">Ver menos</span>
          </summary>
          <div className="mt-3">
            <Barras data={resto} color={color} max={max} format={format} />
          </div>
        </details>
      )}
    </div>
  );
}

function Cifra({ valor, label, tono = "normal", Icon }: { valor: ReactNode; label: string; tono?: "normal" | "logro" | "pendiente"; Icon?: typeof IconUsers }) {
  return (
    <div>
      <p className={cx("flex items-center gap-1.5 font-titulo text-3xl leading-none font-extrabold tracking-tight tabular-nums", tono === "logro" && "text-marca", tono === "pendiente" && "text-alerta")}>
        {Icon && <Icon size={20} className="text-gris" />}
        {valor}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-gris">{label}</p>
    </div>
  );
}

/** Resumen del período: la tarjeta principal y 4 grupos de indicadores. */
export function ResumenEstadistico({ titulo, ind }: { titulo: string; ind: Indicadores }) {
  const personas = personasDelMes(ind);
  const bajas = ind.suspendidas + ind.canceladas;
  return (
    <div className="space-y-3">
      <section aria-label={`Resumen de ${titulo}`} className="bg-institucional relative overflow-hidden rounded-[28px] p-5 text-white shadow-md sm:p-7">
        <svg className="pointer-events-none absolute -right-10 -bottom-16 h-64 w-64 text-white/10" viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r="48" fill="currentColor" /></svg>
        <p className="relative text-sm font-bold tracking-[0.18em] text-white/80 uppercase">{titulo}</p>
        <div className="relative mt-3 grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
          {[
            [formatNumber(ind.programadas), ind.programadas === 1 ? "actividad programada" : "actividades programadas"],
            [formatNumber(ind.realizadas), ind.realizadas === 1 ? "realizada" : "realizadas"],
            [formatNumber(personas), personas === 1 ? "persona inscripta" : "personas inscriptas"],
            [formatNumber(ind.asistentes), ind.asistentes === 1 ? "asistente registrado" : "asistentes registrados"],
          ].map(([v, l], i) => (
            <p key={i} className="leading-none">
              <span className={cx("font-titulo font-extrabold tracking-tight", i === 0 || i === 2 ? "text-5xl" : "text-4xl text-white/95")}>{v}</span>
              <span className="mt-1 block text-[15px] font-semibold text-white/85">{l}</span>
            </p>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Grupo titulo="Actividades" Icon={IconCalendar}>
          <p><b className="text-2xl tabular-nums">{ind.programadas}</b> <span className="text-sm text-gris">programadas</span></p>
          <p><b className="text-lg text-marca tabular-nums">{ind.realizadas}</b> <span className="text-sm text-gris">realizadas</span></p>
          {bajas > 0 && <p className="text-sm font-semibold text-alerta">{ind.suspendidas} suspendidas · {ind.canceladas} canceladas</p>}
        </Grupo>
        <Grupo titulo="Participación" Icon={IconUsers}>
          <p><b className="text-2xl tabular-nums">{formatNumber(ind.inscriptos)}</b> <span className="text-sm text-gris">inscriptos</span></p>
          <p><b className="text-lg text-marca tabular-nums">{formatNumber(ind.asistentes)}</b> <span className="text-sm text-gris">asistentes</span></p>
        </Grupo>
        <Grupo titulo="Asistencia" Icon={IconCheck}>
          {ind.realizadas ? (
            <>
              <p><b className="text-2xl tabular-nums">{ind.pctAsistencia}%</b></p>
              <p className="text-xs text-gris">en las {ind.realizadas} {ind.realizadas === 1 ? "actividad realizada" : "actividades realizadas"}</p>
            </>
          ) : (
            <p className="text-sm text-gris">Se calcula cuando haya actividades realizadas.</p>
          )}
        </Grupo>
        <Grupo titulo="Alcance" Icon={IconUserPlus}>
          <p><b className="text-2xl text-marca tabular-nums">{formatNumber(ind.personasNuevas)}</b> <span className="text-sm text-gris">personas nuevas</span></p>
          <p><b className="text-lg tabular-nums">{formatNumber(ind.personasRecurrentes)}</b> <span className="text-sm text-gris">recurrentes</span></p>
        </Grupo>
      </div>
    </div>
  );
}

function Grupo({ titulo, Icon, children }: { titulo: string; Icon: typeof IconUsers; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-3.5 ring-1 ring-linea sm:p-4">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-gris uppercase">
        <Icon size={15} className="text-petroleo" /> {titulo}
      </h3>
      <div className="space-y-0.5 leading-tight">{children}</div>
    </section>
  );
}

/** Inscriptos, asistentes y % de asistencia, sin alarmar por actividades que todavía no ocurrieron. */
export function InscriptosAsistentes({ ind }: { ind: Indicadores }) {
  if (!ind.inscriptos && !ind.asistentes) return <Vacio />;
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <Cifra valor={formatNumber(ind.inscriptos)} label="Inscriptos" />
        <Cifra valor={formatNumber(ind.asistentes)} label="Asistentes" tono={ind.asistentes ? "logro" : "normal"} />
        <Cifra valor={ind.realizadas ? `${ind.pctAsistencia}%` : "—"} label="Asistencia" />
      </div>
      {ind.realizadas > 0 ? (
        <>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-fondo" role="img" aria-label={`Asistencia: ${ind.pctAsistencia}%`}>
            <div className="h-full rounded-full bg-verde" style={{ width: `${ind.pctAsistencia}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-gris">
            El % de asistencia se calcula solo con las {ind.realizadas} {ind.realizadas === 1 ? "actividad ya realizada" : "actividades ya realizadas"}: las que todavía no ocurrieron no lo bajan.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-gris">Todavía no hay actividades realizadas en este período: la asistencia se va a ver cuando se tome.</p>
      )}
    </div>
  );
}

/** Personas nuevas y recurrentes, con una barra proporcional. */
export function NuevosRecurrentes({ ind }: { ind: Indicadores }) {
  const total = personasDelMes(ind);
  if (!total) return <Vacio />;
  const pn = Math.round((ind.personasNuevas / total) * 100);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Cifra valor={formatNumber(ind.personasNuevas)} label="Nuevas (primera vez)" tono="logro" />
        <Cifra valor={formatNumber(ind.personasRecurrentes)} label="Recurrentes (ya participaron)" />
      </div>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-petroleo-50" role="img" aria-label={`${pn}% nuevas y ${100 - pn}% recurrentes`}>
        <div className="h-full bg-verde" style={{ width: `${pn}%` }} />
        <div className="h-full bg-petroleo/60" style={{ width: `${100 - pn}%` }} />
      </div>
      <p className="mt-1.5 flex justify-between text-sm font-semibold">
        <span className="text-marca">{pn}% nuevas</span>
        <span className="text-gris">{100 - pn}% recurrentes</span>
      </p>
    </div>
  );
}

/** Cobertura territorial: cuántos lugares distintos alcanzamos (solo lo que los datos permiten). */
export function Cobertura({ items }: { items: { valor: number; texto: string }[] }) {
  const con = items.filter((i) => i.valor > 0);
  if (!con.length) return <Vacio />;
  return (
    <ul className="grid gap-2">
      {con.map((i) => (
        <li key={i.texto} className="flex items-center gap-3 rounded-xl bg-fondo px-3.5 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-petroleo ring-1 ring-linea"><IconPin size={18} /></span>
          <p className="leading-tight"><b className="font-titulo text-2xl tabular-nums">{i.valor}</b> <span className="text-[15px] text-gris">{i.texto}</span></p>
        </li>
      ))}
    </ul>
  );
}

export interface FilaComparacion {
  titulo: string;
  actual: number;
  anterior: number;
  mejorSiSube: boolean | null;
  unidad: (n: number) => string; // «5 actividades», «11 personas», «5 puntos»
  formato?: (n: number) => string;
}

/** Comparación con otro período, en tarjetas (sin tablas de scroll lateral). */
export function ComparacionTarjetas({ filas, nombreActual, nombreAnterior }: { filas: FilaComparacion[]; nombreActual: string; nombreAnterior: string }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {filas.map((f) => {
        const c = compararIndicador(f.actual, f.anterior, f.mejorSiSube);
        const fmt = f.formato ?? formatNumber;
        const Icon = c.direccion === "sube" ? IconSube : c.direccion === "baja" ? IconBaja : null;
        return (
          <li key={f.titulo} className="rounded-2xl bg-white p-3.5 ring-1 ring-linea">
            <p className="text-xs font-bold tracking-wide text-gris uppercase">{f.titulo}</p>
            <div className="mt-1.5 flex items-end justify-between gap-2">
              <p className="text-sm text-gris">
                <span className="block text-[11px] capitalize">{nombreAnterior}</span>
                <b className="text-base text-gris tabular-nums">{fmt(f.anterior)}</b>
              </p>
              <span className="pb-1 text-gris" aria-hidden>→</span>
              <p className="text-right text-sm">
                <span className="block text-[11px] text-gris capitalize">{nombreActual}</span>
                <b className="font-titulo text-2xl tabular-nums">{fmt(f.actual)}</b>
              </p>
            </div>
            <p className={cx("mt-1.5 inline-flex items-center gap-1 text-sm font-bold", c.tono === "logro" ? "text-marca" : c.tono === "pendiente" ? "text-alerta" : "text-gris")}>
              {Icon && <Icon size={16} />}
              {c.direccion === "igual" ? "Sin cambios" : `${c.diff > 0 ? "+" : "−"}${f.unidad(Math.abs(c.diff))}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Costos: bloque secundario. */
export function CostosResumen({ ind }: { ind: Indicadores }) {
  if (!ind.costoEstimado && !ind.costoReal) return <Vacio>Todavía no hay costos registrados para este período.</Vacio>;
  const diferencia = ind.costoReal - ind.costoEstimado;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Cifra valor={formatMoney(ind.costoEstimado)} label="Estimado" Icon={IconCash} />
      <Cifra valor={ind.costoReal ? formatMoney(ind.costoReal) : "—"} label="Real" />
      <Cifra valor={ind.costoReal ? `${diferencia > 0 ? "+" : ""}${formatMoney(diferencia)}` : "—"} label="Diferencia (real − estimado)" tono={ind.costoReal ? (diferencia > 0 ? "pendiente" : "logro") : "normal"} />
      <Cifra valor={ind.costoPromedio ? formatMoney(ind.costoPromedio) : "—"} label="Promedio por actividad realizada" />
    </div>
  );
}
