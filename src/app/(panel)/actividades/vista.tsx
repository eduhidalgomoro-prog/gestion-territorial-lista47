import Link from "next/link";
import { ActividadCard } from "@/components/actividad-card";
import { Buscador, FiltroSelect, FiltrosForm } from "@/components/filtros";
import { IconCalendar, IconList, IconMap, IconPlus } from "@/components/icons";
import { MapaActividades, type PuntoMapa } from "@/components/mapa";
import { Badge, cx, Empty, LinkButton, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { conteosPorActividad, filtrarActividades } from "@/lib/domain/metricas";
import { ESTADO_COLOR, ESTADO_HEX, zonaLabel } from "@/lib/labels";
import { actividadesVisibles, esResponsable, puede } from "@/lib/permisos";
import { ESTADOS_ACTIVIDAD, ZONAS_ACTIVIDAD, type Actividad } from "@/lib/schema";
import { addMonths, formatDate, MESES, nombreMes, titleCase, today } from "@/lib/util";
import { filtrosDe, qs, sp, type SP } from "@/lib/view";

export type Vista = "listado" | "calendario" | "mapa";

const TABS: { id: Vista; href: string; label: string; Icon: typeof IconList }[] = [
  { id: "calendario", href: "/calendario", label: "Calendario", Icon: IconCalendar },
  { id: "listado", href: "/actividades", label: "Listado", Icon: IconList },
  { id: "mapa", href: "/mapa", label: "Mapa", Icon: IconMap },
];

export async function VistaActividades({ vista, searchParams }: { vista: Vista; searchParams: Promise<SP> }) {
  const yo = await requireUser();
  const q = await searchParams;
  const f = filtrosDe(q);
  // El calendario siempre muestra un mes.
  if (vista === "calendario" && !f.mes) f.mes = Number(today().slice(5, 7));
  const s = await snapshot();
  const visibles = actividadesVisibles(yo, s.actividades, s.asignaciones);
  const lista = filtrarActividades(visibles, f).sort((a, b) =>
    vista === "listado" && (f.mes === 0 || !f.mes) ? b.fecha.localeCompare(a.fecha) : (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio),
  );
  const conteos = conteosPorActividad(s);
  const barrios = [...new Set(visibles.map((a) => a.barrio).filter(Boolean))].sort();
  const responsables = [...new Set(visibles.map((a) => a.responsable).filter(Boolean))].sort();
  const tipos = [...new Set([...s.config.tipos_actividad, ...visibles.map((a) => a.tipo)].filter(Boolean))].sort();
  const keep = { mes: f.mes, anio: f.anio, zona: f.zona, barrio: f.barrio, responsable: f.responsable, tipo: f.tipo, estado: f.estado, q: f.q };
  const hayFiltros = !!(f.zona || f.barrio || f.responsable || f.tipo || f.estado || f.q);
  const anioActual = Number(today().slice(0, 4));
  const tabHref = TABS.find((t) => t.id === vista)!.href;

  return (
    <>
      <PageHeader
        title="Actividades"
        subtitle={`${lista.length} ${lista.length === 1 ? "actividad" : "actividades"}${f.mes ? ` en ${nombreMes(f.mes).toLowerCase()}` : ""} ${f.anio}`}
        actions={puede.crearActividad(yo) ? <div className="hidden lg:block"><LinkButton href="/actividades/nueva"><IconPlus size={20} /> Nueva actividad</LinkButton></div> : undefined}
      />

      <nav className="mb-4 grid grid-cols-3 gap-1 rounded-2xl border border-linea bg-white p-1" aria-label="Cambiar vista">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`${t.href}${qs(keep)}`}
            aria-current={t.id === vista ? "page" : undefined}
            className={cx(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold uppercase tracking-wide",
              t.id === vista ? "bg-petroleo text-white" : "text-gris hover:bg-fondo",
            )}
          >
            <t.Icon size={18} /> {t.label}
          </Link>
        ))}
      </nav>

      <FiltrosForm action={tabHref} className="mb-4 space-y-2">
        {vista !== "calendario" && <Buscador value={f.q ?? ""} placeholder="Buscar por nombre, responsable, barrio o zona" />}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <FiltroSelect name="mes" label="Mes" value={f.mes ?? 0} options={[...(vista === "calendario" ? [] : [[0, "Todo el año"] as const]), ...MESES.map((m, i) => [i + 1, m] as const)]} />
          <FiltroSelect name="anio" label="Año" value={f.anio ?? anioActual} options={[anioActual - 1, anioActual, anioActual + 1].map((a) => [a, String(a)] as const)} />
          {!esResponsable(yo) && (
            <FiltroSelect name="zona" label="Zona" value={f.zona ?? ""} placeholder="Todas las zonas" options={[...ZONAS_ACTIVIDAD.map((z) => [z, zonaLabel(z)] as const), ["SIN", "Sin zona"] as const]} />
          )}
          <FiltroSelect name="estado" label="Estado" value={f.estado ?? ""} placeholder="Todos los estados" options={ESTADOS_ACTIVIDAD.map((e) => [e, e] as const)} />
        </div>
        <details className="group" open={!!(f.barrio || f.tipo || f.responsable)}>
          <summary className="cursor-pointer list-none text-sm font-bold text-petroleo">
            <span className="group-open:hidden">+ Más filtros (barrio, tipo, responsable)</span>
            <span className="hidden group-open:inline">− Menos filtros</span>
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <FiltroSelect name="barrio" label="Barrio" value={f.barrio ?? ""} placeholder="Todos los barrios" options={barrios.map((b) => [b, titleCase(b)] as const)} />
            <FiltroSelect name="tipo" label="Tipo" value={f.tipo ?? ""} placeholder="Todos los tipos" options={tipos.map((t) => [t, t] as const)} />
            <FiltroSelect name="responsable" label="Responsable" value={f.responsable ?? ""} placeholder="Todos los responsables" options={responsables.map((r) => [r, r] as const)} />
          </div>
        </details>
        {hayFiltros && (
          <Link href={`${tabHref}${qs({ mes: f.mes, anio: f.anio })}`} className="inline-block text-sm font-bold text-petroleo hover:underline">
            Limpiar filtros
          </Link>
        )}
      </FiltrosForm>

      {vista === "listado" && <Listado lista={lista} conteos={conteos} />}
      {vista === "calendario" && <Calendario lista={lista} anio={f.anio!} mes={f.mes!} keep={keep} />}
      {vista === "mapa" && <Mapa lista={lista} conteos={conteos} foco={sp(q, "foco")} />}
    </>
  );
}

function Listado({ lista, conteos }: { lista: Actividad[]; conteos: ReturnType<typeof conteosPorActividad> }) {
  if (!lista.length) return <Empty>No hay actividades con estos filtros.</Empty>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {lista.map((a) => (
        <ActividadCard key={a.id} a={a} conteo={conteos.get(a.id)} />
      ))}
    </div>
  );
}

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function Calendario({ lista, anio, mes, keep }: { lista: Actividad[]; anio: number; mes: number; keep: Record<string, string | number | undefined> }) {
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const offset = (primero.getUTCDay() + 6) % 7; // lunes primero
  const porDia = new Map<number, Actividad[]>();
  for (const a of lista) {
    if (!a.fecha) continue;
    const d = Number(a.fecha.slice(8, 10));
    porDia.set(d, [...(porDia.get(d) ?? []), a]);
  }
  const hoy = today();
  const ant = addMonths(anio, mes, -1);
  const sig = addMonths(anio, mes, 1);
  const celdas = Array.from({ length: Math.ceil((offset + diasMes) / 7) * 7 }, (_, i) => i - offset + 1);
  const fechaDe = (d: number) => `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const conFecha = [...porDia.keys()].sort((a, b) => a - b);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Link href={`/calendario${qs({ ...keep, mes: ant.mes, anio: ant.anio })}`} className="rounded-xl px-3 py-2 text-sm font-bold text-petroleo hover:bg-white">
          ← {nombreMes(ant.mes)}
        </Link>
        <h2 className="font-titulo text-lg font-extrabold">{nombreMes(mes)} {anio}</h2>
        <Link href={`/calendario${qs({ ...keep, mes: sig.mes, anio: sig.anio })}`} className="rounded-xl px-3 py-2 text-sm font-bold text-petroleo hover:bg-white">
          {nombreMes(sig.mes)} →
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-linea bg-white">
        <div className="grid grid-cols-7 border-b border-linea bg-fondo text-center text-xs font-bold text-gris">
          {DIAS.map((d) => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {celdas.map((d, i) => {
            const valido = d >= 1 && d <= diasMes;
            const acts = valido ? porDia.get(d) ?? [] : [];
            const esHoy = valido && fechaDe(d) === hoy;
            return (
              <div key={i} className={cx("min-h-14 border-r border-b border-linea p-1 sm:min-h-28 sm:p-1.5", (i + 1) % 7 === 0 && "border-r-0", !valido && "bg-fondo/60")}>
                {valido && (
                  <>
                    <span className={cx("inline-flex size-6 items-center justify-center rounded-full text-xs font-bold", esHoy ? "bg-petroleo text-white" : "text-gris")}>{d}</span>
                    {/* Celular: puntos de color. Computadora: nombre de la actividad. */}
                    <div className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden">
                      {acts.map((a) => (
                        <a key={a.id} href={`#dia-${d}`} className="size-2.5 rounded-full" style={{ background: ESTADO_HEX[a.estado] }} aria-label={a.nombre} />
                      ))}
                    </div>
                    <ul className="mt-1 hidden space-y-1 sm:block">
                      {acts.slice(0, 3).map((a) => (
                        <li key={a.id}>
                          <Link
                            href={`/actividades/${a.id}`}
                            className="block truncate rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-semibold text-white hover:opacity-90"
                            style={{ background: ESTADO_HEX[a.estado] }}
                            title={`${a.nombre} · ${zonaLabel(a.zona)} · ${a.estado}`}
                          >
                            {a.hora_inicio && `${a.hora_inicio} `}
                            {a.nombre}
                          </Link>
                        </li>
                      ))}
                      {acts.length > 3 && <li className="px-1 text-[11px] font-bold text-gris"><a href={`#dia-${d}`}>+{acts.length - 3} más</a></li>}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-gris">
        {ESTADOS_ACTIVIDAD.map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: ESTADO_HEX[e] }} /> {e}
          </span>
        ))}
      </div>

      <section className="mt-6" aria-label="Agenda del mes">
        <h2 className="mb-2 text-lg font-bold">Agenda de {nombreMes(mes).toLowerCase()}</h2>
        {conFecha.length === 0 ? (
          <Empty>No hay actividades este mes.</Empty>
        ) : (
          <ol className="space-y-4">
            {conFecha.map((d) => (
              <li key={d} id={`dia-${d}`} className="scroll-mt-20">
                <p className="mb-1.5 text-sm font-bold text-gris first-letter:uppercase">{formatDate(fechaDe(d), { weekday: "long", day: "numeric", month: "long" })}</p>
                <div className="space-y-2">
                  {porDia.get(d)!.map((a) => (
                    <Link key={a.id} href={`/actividades/${a.id}`} className="flex items-center gap-3 rounded-xl border border-linea bg-white p-3 hover:border-petroleo">
                      <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: ESTADO_HEX[a.estado] }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{a.nombre}</span>
                        <span className="block text-sm text-gris">
                          {a.hora_inicio || "Sin horario"} · {zonaLabel(a.zona)}
                          {a.barrio && ` · ${titleCase(a.barrio)}`}
                        </span>
                      </span>
                      <Badge color={ESTADO_COLOR[a.estado]}>{a.estado}</Badge>
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
        {lista.some((a) => !a.fecha) && <Notice className="mt-3">Hay actividades sin fecha (borradores): aparecen en el listado.</Notice>}
      </section>
    </div>
  );
}

function Mapa({ lista, conteos, foco }: { lista: Actividad[]; conteos: ReturnType<typeof conteosPorActividad>; foco: string }) {
  const con = lista.filter((a) => a.lat && a.lng);
  const sin = lista.filter((a) => !a.lat || !a.lng);
  const puntos: PuntoMapa[] = con.map((a) => ({
    id: a.id,
    lat: a.lat,
    lng: a.lng,
    nombre: a.nombre,
    fecha: a.fecha ? `${formatDate(a.fecha)}${a.hora_inicio ? ` ${a.hora_inicio}` : ""}` : "",
    zona: zonaLabel(a.zona),
    barrio: titleCase(a.barrio),
    responsable: a.responsable,
    tipo: a.tipo,
    estado: a.estado,
    asistentes: conteos.get(a.id)?.presentes ?? 0,
    color: ESTADO_HEX[a.estado],
  }));
  return (
    <div>
      <MapaActividades puntos={puntos} focoId={foco || undefined} />
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-gris">
        {ESTADOS_ACTIVIDAD.map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: ESTADO_HEX[e] }} /> {e}
          </span>
        ))}
      </div>
      {sin.length > 0 && (
        <details className="mt-4 rounded-2xl border border-linea bg-white p-4">
          <summary className="cursor-pointer font-bold">
            {sin.length} {sin.length === 1 ? "actividad sin ubicación" : "actividades sin ubicación"} en el mapa
          </summary>
          <p className="mt-2 text-sm text-gris">Entrá a cada una, tocá «Editar» y ubicala en el paso «Fecha y ubicación».</p>
          <ul className="mt-2 space-y-1">
            {sin.map((a) => (
              <li key={a.id}>
                <Link href={`/actividades/${a.id}/editar?paso=2`} className="text-sm font-semibold text-petroleo hover:underline">
                  {a.nombre} {a.barrio && `· ${titleCase(a.barrio)}`}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
