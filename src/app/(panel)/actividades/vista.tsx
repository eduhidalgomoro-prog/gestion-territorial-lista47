import Link from "next/link";
import { ActividadCard } from "@/components/actividad-card";
import { Buscador, FiltroSelect, FiltrosForm } from "@/components/filtros";
import { IconCalendar, IconList, IconMap, IconPlus } from "@/components/icons";
import { MapaActividades, type Encuadre, type PuntoMapa } from "@/components/mapa";
import { Badge, cx, Empty, LinkButton, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CATEGORIAS, categoriaDe, emojisDe, labelCategoria, type CategoriaId } from "@/lib/categorias";
import { snapshot } from "@/lib/db";
import { conteosPorActividad, filtrarActividades } from "@/lib/domain/metricas";
import { ESTADO_COLOR, ESTADO_HEX, ubicacionLabel, zonaLabel } from "@/lib/labels";
import { actividadesVisibles, esOperador, esResponsable, puede } from "@/lib/permisos";
import { ESTADOS_ACTIVIDAD, ZONAS_ACTIVIDAD, type Actividad } from "@/lib/schema";
import { ambitoDe, parseRegiones, regionLabel } from "@/lib/territorio";
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
  // Capital / Interior / Toda la provincia: para quien ve más de una zona.
  const conAmbito = !esResponsable(yo) && !esOperador(yo);
  if (!conAmbito || (f.ambito !== "capital" && f.ambito !== "interior")) f.ambito = "";
  const regiones = parseRegiones(s.config.regiones_interior);
  const regionesUsadas = [...new Set([...regiones.map((r) => r.nombre), ...visibles.map((a) => a.zona).filter((z) => z && ambitoDe(z) === "interior")])];
  const lista = filtrarActividades(visibles, f).sort((a, b) =>
    vista === "listado" && (f.mes === 0 || !f.mes) ? b.fecha.localeCompare(a.fecha) : (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio),
  );
  const conteos = conteosPorActividad(s);
  const delAmbito = f.ambito ? visibles.filter((a) => ambitoDe(a.zona) === f.ambito) : visibles;
  const barrios = [...new Set(delAmbito.map((a) => a.barrio).filter(Boolean))].sort();
  const localidades = [...new Set(delAmbito.map((a) => a.localidad).filter(Boolean))].sort();
  const responsables = [...new Set(delAmbito.map((a) => a.responsable).filter(Boolean))].sort();
  const tipos = [...new Set([...s.config.tipos_actividad, ...visibles.map((a) => a.tipo)].filter(Boolean))].sort();
  const opcionesZona = [
    ...(f.ambito !== "interior" ? [...ZONAS_ACTIVIDAD.map((z) => [z, zonaLabel(z)] as const), ["SIN", "Sin zona"] as const] : []),
    ...(f.ambito !== "capital" ? regionesUsadas.sort().map((r) => [r, regionLabel(r)] as const) : []),
  ];
  const keep = { ambito: f.ambito, mes: f.mes, anio: f.anio, zona: f.zona, localidad: f.localidad, barrio: f.barrio, responsable: f.responsable, tipo: f.tipo, estado: f.estado, q: f.q };
  const hayFiltros = !!(f.zona || f.localidad || f.barrio || f.responsable || f.tipo || f.estado || f.q);
  const anioActual = Number(today().slice(0, 4));
  const tabHref = TABS.find((t) => t.id === vista)!.href;
  // Mapa: toda la provincia en «Toda la provincia» e «Interior»; la ciudad en Capital; la región elegida si se filtra una.
  const zonaDeCapital = (z: string) => z === "SIN" || ambitoDe(z) === "capital";
  const encuadre: Encuadre = conAmbito
    ? f.zona
      ? zonaDeCapital(f.zona) ? "capital" : "region"
      : f.ambito === "capital" ? "capital" : "provincia"
    : ambitoDe(yo.zona) === "interior" || lista.some((a) => ambitoDe(a.zona) === "interior") ? "region" : "capital";

  return (
    <>
      <PageHeader
        title="Actividades"
        subtitle={`${lista.length} ${lista.length === 1 ? "actividad" : "actividades"}${f.mes ? ` en ${nombreMes(f.mes).toLowerCase()}` : ""} ${f.anio}`}
        actions={puede.crearActividad(yo) ? <div className="hidden lg:block"><LinkButton href="/actividades/nueva"><IconPlus size={20} /> Nueva actividad</LinkButton></div> : undefined}
      />

      {conAmbito && (
        <nav className="mb-2 flex gap-1 overflow-x-auto" aria-label="Capital o interior">
          {([["", "Toda la provincia"], ["capital", "Capital"], ["interior", "Interior"]] as const).map(([id, label]) => (
            <Link
              key={id}
              href={`${tabHref}${qs({ ambito: id, mes: f.mes, anio: f.anio, estado: f.estado, tipo: f.tipo, q: f.q })}`}
              aria-current={f.ambito === id ? "page" : undefined}
              className={cx(
                "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-bold whitespace-nowrap",
                f.ambito === id ? "border-marca bg-verde-50 text-marca-600" : "border-linea bg-white text-gris hover:border-petroleo",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}

      <nav className="mb-4 grid grid-cols-3 gap-1 rounded-2xl border border-linea bg-white p-1" aria-label="Cambiar vista">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`${t.href}${qs(keep)}`}
            aria-current={t.id === vista ? "page" : undefined}
            className={cx(
              "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl text-[12px] font-bold tracking-tight uppercase sm:gap-1.5 sm:text-sm sm:tracking-wide",
              t.id === vista ? "bg-petroleo text-white" : "text-gris hover:bg-fondo",
            )}
          >
            <t.Icon size={16} className="shrink-0" /> {t.label}
          </Link>
        ))}
      </nav>

      <FiltrosForm action={tabHref} className="mb-4 space-y-2">
        {f.ambito && <input type="hidden" name="ambito" value={f.ambito} />}
        {vista !== "calendario" && <Buscador value={f.q ?? ""} placeholder="Buscar por nombre, responsable, barrio, localidad o zona" />}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <FiltroSelect name="mes" label="Mes" value={f.mes ?? 0} options={[...(vista === "calendario" ? [] : [[0, "Todo el año"] as const]), ...MESES.map((m, i) => [i + 1, m] as const)]} />
          <FiltroSelect name="anio" label="Año" value={f.anio ?? anioActual} options={[anioActual - 1, anioActual, anioActual + 1].map((a) => [a, String(a)] as const)} />
          {!esResponsable(yo) && (
            <FiltroSelect name="zona" label="Zona o región" value={f.zona ?? ""} placeholder={f.ambito === "interior" ? "Todas las regiones" : "Todas las zonas"} options={opcionesZona} />
          )}
          <FiltroSelect name="estado" label="Estado" value={f.estado ?? ""} placeholder="Todos los estados" options={ESTADOS_ACTIVIDAD.map((e) => [e, e] as const)} />
        </div>
        <details className="group" open={!!(f.barrio || f.localidad || f.tipo || f.responsable)}>
          <summary className="cursor-pointer list-none text-sm font-bold text-petroleo">
            <span className="group-open:hidden">+ Más filtros ({localidades.length ? "localidad, " : ""}barrio, tipo, responsable)</span>
            <span className="hidden group-open:inline">− Menos filtros</span>
          </summary>
          <div className={cx("mt-2 grid grid-cols-1 gap-2", localidades.length ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
            {localidades.length > 0 && (
              <FiltroSelect name="localidad" label="Localidad" value={f.localidad ?? ""} placeholder="Todas las localidades" options={localidades.map((l) => [l, l] as const)} />
            )}
            <FiltroSelect name="barrio" label="Barrio" value={f.barrio ?? ""} placeholder="Todos los barrios" options={barrios.map((b) => [b, titleCase(b)] as const)} />
            <FiltroSelect name="tipo" label="Tipo" value={f.tipo ?? ""} placeholder="Todos los tipos" options={tipos.map((t) => [t, t] as const)} />
            <FiltroSelect name="responsable" label="Responsable" value={f.responsable ?? ""} placeholder="Todos los responsables" options={responsables.map((r) => [r, r] as const)} />
          </div>
        </details>
        {hayFiltros && (
          <Link href={`${tabHref}${qs({ ambito: f.ambito, mes: f.mes, anio: f.anio })}`} className="inline-block text-sm font-bold text-petroleo hover:underline">
            Limpiar filtros
          </Link>
        )}
      </FiltrosForm>

      {vista === "listado" && <Listado lista={lista} conteos={conteos} />}
      {vista === "calendario" && <Calendario lista={lista} anio={f.anio!} mes={f.mes!} keep={keep} />}
      {vista === "mapa" && <Mapa lista={lista} conteos={conteos} foco={sp(q, "foco")} emojis={emojisDe(s.config.emojis_mapa)} encuadre={encuadre} />}
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

const esInterior = (a: Actividad) => ambitoDe(a.zona) === "interior";

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
                      {acts.map((a) =>
                        esInterior(a) ? (
                          <a key={a.id} href={`#dia-${d}`} className="size-2.5 rounded-full border-2 bg-white" style={{ borderColor: ESTADO_HEX[a.estado] }} aria-label={`${a.nombre} (interior)`} />
                        ) : (
                          <a key={a.id} href={`#dia-${d}`} className="size-2.5 rounded-full" style={{ background: ESTADO_HEX[a.estado] }} aria-label={a.nombre} />
                        ),
                      )}
                    </div>
                    <ul className="mt-1 hidden space-y-1 sm:block">
                      {acts.slice(0, 3).map((a) => (
                        <li key={a.id}>
                          {/* Capital: fondo del color del estado. Interior: borde del color del estado y la localidad adelante. */}
                          <Link
                            href={`/actividades/${a.id}`}
                            className={cx(
                              "block truncate rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-semibold hover:opacity-90",
                              esInterior(a) ? "border-[1.5px] bg-white" : "text-white",
                            )}
                            style={esInterior(a) ? { borderColor: ESTADO_HEX[a.estado], color: ESTADO_HEX[a.estado] } : { background: ESTADO_HEX[a.estado] }}
                            title={`${a.nombre} · ${ubicacionLabel(a)} · ${a.estado}`}
                          >
                            {esInterior(a) && <b className="uppercase">{a.localidad || "Interior"} · </b>}
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
      {lista.some(esInterior) && (
        <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold text-gris">
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded bg-petroleo px-1.5 py-0.5 text-[10px] text-white">Taller</span> Capital (relleno)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded border-[1.5px] border-petroleo bg-white px-1.5 py-0.5 text-[10px] text-petroleo"><b>GOYA ·</b> Taller</span> Interior (con borde y localidad)
          </span>
        </div>
      )}

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
                      <span
                        className={cx("h-10 w-1.5 shrink-0 rounded-full", esInterior(a) && "border-2 bg-white")}
                        style={esInterior(a) ? { borderColor: ESTADO_HEX[a.estado] } : { background: ESTADO_HEX[a.estado] }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="mb-0.5 block text-[11px] font-bold tracking-wide uppercase" style={{ color: esInterior(a) ? "#3f742c" : "#106985" }}>
                          {esInterior(a) ? `Interior · ${a.localidad || "sin localidad"}` : "Capital"}
                        </span>
                        <span className="block truncate font-bold">{a.nombre}</span>
                        <span className="block text-sm text-gris">
                          {a.hora_inicio || "Sin horario"} · {ubicacionLabel(a)}
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

function Mapa({ lista, conteos, foco, emojis, encuadre }: { lista: Actividad[]; conteos: ReturnType<typeof conteosPorActividad>; foco: string; emojis: Record<CategoriaId, string>; encuadre: Encuadre }) {
  const con = lista.filter((a) => a.lat && a.lng);
  const sin = lista.filter((a) => !a.lat || !a.lng);
  const presentes = new Set(con.map((a) => categoriaDe(a)));
  const puntos: PuntoMapa[] = con.map((a) => ({
    emoji: emojis[categoriaDe(a)],
    categoria: labelCategoria(categoriaDe(a)),
    id: a.id,
    lat: a.lat,
    lng: a.lng,
    nombre: a.nombre,
    fecha: a.fecha ? `${formatDate(a.fecha)}${a.hora_inicio ? ` ${a.hora_inicio}` : ""}` : "",
    zona: ubicacionLabel(a),
    barrio: titleCase(a.barrio),
    responsable: a.responsable,
    tipo: a.tipo,
    estado: a.estado,
    asistentes: conteos.get(a.id)?.presentes ?? 0,
    color: ESTADO_HEX[a.estado],
  }));
  return (
    <div>
      <MapaActividades puntos={puntos} focoId={foco || undefined} encuadre={encuadre} />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-tinta">
        {CATEGORIAS.filter((c) => presentes.has(c.id)).map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5">
            <span className="text-lg leading-none">{emojis[c.id]}</span> {c.label}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-gris">
        <span>Borde:</span>
        {ESTADOS_ACTIVIDAD.map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-full border-[3px] bg-white" style={{ borderColor: ESTADO_HEX[e] }} /> {e}
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
