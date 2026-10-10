import Link from "next/link";
import { ActividadCard, EstadoBadge, GuiaBadge } from "@/components/actividad-card";
import { NavegarAgenda } from "@/components/calendario-agenda";
import { Buscador, FiltroSelect, FiltrosForm } from "@/components/filtros";
import { IconArrowLeft, IconArrowRight, IconCalendar, IconHuella, IconList, IconMap, IconPin, IconPlus, IconUsers } from "@/components/icons";
import { MapaActividades, type Encuadre, type PuntoMapa } from "@/components/mapa";
import { cx, Empty, LinkButton, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CATEGORIAS, categoriaDe, emojisDe, labelCategoria, type CategoriaId } from "@/lib/categorias";
import { snapshot } from "@/lib/db";
import { conteosPorActividad, filtrarActividades } from "@/lib/domain/metricas";
import { conteosHuellas, esMarcandoHuellas } from "@/lib/huellas";
import { ESTADO_HEX, titulo, ubicacionLabel, zonaLabel } from "@/lib/labels";
import { actividadesVisibles, esOperador, esResponsable, misZonas, puede } from "@/lib/permisos";
import { ESTADOS_ACTIVIDAD, ZONAS_ACTIVIDAD, type Actividad } from "@/lib/schema";
import { ambitoDe, parseRegiones, regionLabel } from "@/lib/territorio";
import { addMonths, formatDate, MESES, mesAnio, nombreMes, titleCase, today } from "@/lib/util";
import { filtrosDe, qs, sp, type SP } from "@/lib/view";

export type Vista = "listado" | "calendario" | "mapa";

/** Criterios de orden del listado ("" = el de siempre). */
const ORDENES = [
  ["", "Por fecha"],
  ["proximas", "Próximas primero"],
  ["fecha", "Fecha (más antigua primero)"],
  ["recientes", "Fecha (más reciente primero)"],
  ["inscriptos", "Más inscriptos"],
  ["nombre", "Nombre (A–Z)"],
] as const;

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
  // «Próximas»: de hoy en adelante, de cualquier mes. Es lo que muestra el mapa si no se elige un mes
  // (así, a fin de mes ya se ve lo que viene).
  const mesQ = sp(q, "mes");
  const proximas = vista !== "calendario" && (mesQ === "prox" || (vista === "mapa" && mesQ === ""));
  if (proximas) {
    f.mes = 0;
    f.anio = 0;
  }
  const hoyISO = today();
  const s = await snapshot();
  const visibles = actividadesVisibles(yo, s.actividades, s.asignaciones);
  // Capital / Interior / Toda la provincia: para quien ve más de una zona.
  const conAmbito = !esResponsable(yo) && !esOperador(yo);
  if (!conAmbito || (f.ambito !== "capital" && f.ambito !== "interior")) f.ambito = "";
  const regiones = parseRegiones(s.config.regiones_interior);
  const regionesUsadas = [...new Set([...regiones.map((r) => r.nombre), ...visibles.map((a) => a.zona).filter((z) => z && ambitoDe(z) === "interior")])];
  const conteos = conteosPorActividad(s);
  const huellasPorActividad = conteosHuellas(s.atenciones, s.animales);
  // Orden del listado (solo presentación). Sin elegir, el de siempre: por fecha (todo el año: lo más reciente primero).
  const orden = ORDENES.some(([id]) => id === sp(q, "orden")) ? sp(q, "orden") : "";
  const porFecha = (a: Actividad, b: Actividad) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio);
  const inscriptosDe = (a: Actividad) => conteos.get(a.id)?.inscriptos ?? 0;
  const comparar: Record<string, (a: Actividad, b: Actividad) => number> = {
    proximas: (a, b) => {
      const fa = !!a.fecha && a.fecha >= hoyISO;
      const fb = !!b.fecha && b.fecha >= hoyISO;
      if (fa !== fb) return fa ? -1 : 1;
      return fa ? porFecha(a, b) : porFecha(b, a);
    },
    fecha: porFecha,
    recientes: (a, b) => porFecha(b, a),
    inscriptos: (a, b) => inscriptosDe(b) - inscriptosDe(a) || porFecha(a, b),
    nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
  };
  const lista = filtrarActividades(visibles, f)
    .filter((a) => !proximas || (a.fecha >= hoyISO && a.estado !== "CANCELADA" && a.estado !== "REALIZADA"))
    .sort(
      vista === "listado" && orden
        ? comparar[orden]
        : (a, b) => (vista === "listado" && !proximas && (f.mes === 0 || !f.mes) ? b.fecha.localeCompare(a.fecha) : porFecha(a, b)),
    );
  // Resumen sobre las tarjetas: cantidad, inscriptos y zonas distintas de lo que se está viendo.
  const totalInscriptos = lista.reduce((n, a) => n + inscriptosDe(a), 0);
  const zonasDistintas = new Set(lista.map((a) => a.zona).filter(Boolean)).size;
  const delAmbito = f.ambito ? visibles.filter((a) => ambitoDe(a.zona) === f.ambito) : visibles;
  const barrios = [...new Set(delAmbito.map((a) => a.barrio).filter(Boolean))].sort();
  const localidades = [...new Set(delAmbito.map((a) => a.localidad).filter(Boolean))].sort();
  const responsables = [...new Set(delAmbito.map((a) => a.responsable).filter(Boolean))].sort();
  const tipos = [...new Set([...s.config.tipos_actividad, ...visibles.map((a) => a.tipo)].filter(Boolean))].sort();
  const opcionesZona = [
    ...(f.ambito !== "interior" ? [...ZONAS_ACTIVIDAD.map((z) => [z, zonaLabel(z)] as const), ["SIN", "Sin zona"] as const] : []),
    ...(f.ambito !== "capital" ? regionesUsadas.sort().map((r) => [r, regionLabel(r)] as const) : []),
  ];
  const keep = { ambito: f.ambito, mes: proximas ? "prox" : f.mes, anio: proximas ? undefined : f.anio, zona: f.zona, localidad: f.localidad, barrio: f.barrio, responsable: f.responsable, tipo: f.tipo, estado: f.estado, q: f.q, orden };
  const masFiltros = [f.localidad, f.barrio, f.tipo, f.responsable].filter(Boolean).length;
  const hayFiltros = !!(f.zona || f.localidad || f.barrio || f.responsable || f.tipo || f.estado || f.q);
  const anioActual = Number(today().slice(0, 4));
  const tabHref = TABS.find((t) => t.id === vista)!.href;
  // Mapa: toda la provincia en «Toda la provincia» e «Interior»; la ciudad en Capital; la región elegida si se filtra una.
  const zonaDeCapital = (z: string) => z === "SIN" || ambitoDe(z) === "capital";
  const encuadre: Encuadre = conAmbito || f.zona
    ? f.zona
      ? zonaDeCapital(f.zona) ? "capital" : "region"
      : f.ambito === "capital" ? "capital" : "provincia"
    : misZonas(yo).some((z) => ambitoDe(z) === "capital") && misZonas(yo).some((z) => ambitoDe(z) === "interior")
      ? "provincia" // responsable de Capital y del interior a la vez
      : misZonas(yo).some((z) => ambitoDe(z) === "interior") || lista.some((a) => ambitoDe(a.zona) === "interior") ? "region" : "capital";

  return (
    <>
      <PageHeader
        title="Actividades"
        subtitle={
          proximas
            ? `${lista.length} ${lista.length === 1 ? "actividad próxima" : "actividades próximas"}`
            : `${lista.length} ${lista.length === 1 ? "actividad" : "actividades"}${f.mes ? ` en ${nombreMes(f.mes).toLowerCase()}` : ""} ${f.anio}`
        }
        actions={puede.crearActividad(yo) ? <div className="hidden lg:block"><LinkButton href="/actividades/nueva"><IconPlus size={20} /> Nueva actividad</LinkButton></div> : undefined}
      />

      {conAmbito && (
        <nav className="mb-2 flex gap-1 overflow-x-auto" aria-label="Capital o interior">
          {([["", "Toda la provincia"], ["capital", "Capital"], ["interior", "Interior"]] as const).map(([id, label]) => (
            <Link
              key={id}
              href={`${tabHref}${qs({ ambito: id, mes: keep.mes, anio: keep.anio, estado: f.estado, tipo: f.tipo, q: f.q })}`}
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

      <FiltrosForm action={tabHref} className="mb-4 space-y-2.5">
        {f.ambito && <input type="hidden" name="ambito" value={f.ambito} />}
        <div className="flex flex-wrap items-center gap-2">
          {vista !== "calendario" && (
            <div className="w-full lg:w-auto lg:min-w-56 lg:flex-1">
              <Buscador value={f.q ?? ""} placeholder="Buscar actividad, responsable, barrio…" />
            </div>
          )}
          <div className="contents">
            <FiltroSelect
              chip
              name="mes"
              label="Mes"
              activo={false}
              value={proximas ? "prox" : f.mes ?? 0}
              options={[...(vista === "calendario" ? [] : [["prox", "Próximas"] as const, [0, "Todo el año"] as const]), ...MESES.map((m, i) => [i + 1, m] as const)]}
            />
            {!proximas && (
              <FiltroSelect chip name="anio" label="Año" activo={false} value={f.anio || anioActual} options={[anioActual - 1, anioActual, anioActual + 1].map((a) => [a, String(a)] as const)} />
            )}
            {!esResponsable(yo) ? (
              <FiltroSelect chip name="zona" label="Zona o región" value={f.zona ?? ""} placeholder={f.ambito === "interior" ? "Región: todas" : "Zona: todas"} options={opcionesZona} />
            ) : misZonas(yo).length > 1 && (
              // Responsable con varias zonas: puede mirar una sola.
              <FiltroSelect chip name="zona" label="Zona o región" value={f.zona ?? ""} placeholder="Zona: todas las mías" options={misZonas(yo).map((z) => [z, zonaLabel(z)] as const)} />
            )}
            <FiltroSelect chip name="estado" label="Estado" value={f.estado ?? ""} placeholder="Estado: todos" options={ESTADOS_ACTIVIDAD.map((e) => [e, titulo(e)] as const)} />
            <details className="group open:basis-full" open={masFiltros > 0}>
              <summary
                className={cx(
                  "inline-flex h-10 cursor-pointer list-none items-center rounded-full border px-3.5 text-sm font-bold",
                  masFiltros ? "border-petroleo bg-petroleo-50 text-petroleo-600" : "border-dashed border-linea bg-white text-petroleo hover:border-petroleo",
                )}
              >
                <span className="group-open:hidden">+ Más filtros{masFiltros ? ` (${masFiltros})` : ""}</span>
                <span className="hidden group-open:inline">− Menos filtros</span>
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {localidades.length > 0 && (
                  <FiltroSelect chip name="localidad" label="Localidad" value={f.localidad ?? ""} placeholder="Localidad: todas" options={localidades.map((l) => [l, l] as const)} />
                )}
                <FiltroSelect chip name="barrio" label="Barrio" value={f.barrio ?? ""} placeholder="Barrio: todos" options={barrios.map((b) => [b, titleCase(b)] as const)} />
                <FiltroSelect chip name="tipo" label="Tipo" value={f.tipo ?? ""} placeholder="Tipo: todos" options={tipos.map((t) => [t, t] as const)} />
                <FiltroSelect chip name="responsable" label="Responsable" value={f.responsable ?? ""} placeholder="Responsable: todos" options={responsables.map((r) => [r, r] as const)} />
              </div>
            </details>
            {hayFiltros && (
              <Link href={`${tabHref}${qs({ ambito: f.ambito, mes: keep.mes, anio: keep.anio })}`} className="inline-flex h-10 items-center px-2 text-sm font-bold text-petroleo hover:underline">
                Limpiar
              </Link>
            )}
          </div>
        </div>

        {/* Resumen de lo que se está viendo + orden (solo en el listado). */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-linea pt-2.5">
          <p className="text-[15px] text-gris">
            <b className="text-tinta">{lista.length}</b> {lista.length === 1 ? "actividad" : "actividades"} · <b className="text-tinta">{totalInscriptos}</b>{" "}
            {totalInscriptos === 1 ? "inscripto" : "inscriptos"} · <b className="text-tinta">{zonasDistintas}</b> {zonasDistintas === 1 ? "zona" : "zonas"}
          </p>
          {vista === "listado" && (
            <label className="flex items-center gap-2 text-sm text-gris">
              Ordenar
              <FiltroSelect chip name="orden" label="Ordenar" activo={false} value={orden} placeholder="Por fecha" options={ORDENES.filter(([id]) => id !== "")} />
            </label>
          )}
        </div>
      </FiltrosForm>

      {vista === "listado" && <Listado lista={lista} conteos={conteos} huellas={huellasPorActividad} />}
      {vista === "calendario" && <Calendario lista={lista} anio={f.anio!} mes={f.mes!} keep={keep} conteos={conteos} huellas={huellasPorActividad} />}
      {vista === "mapa" && <Mapa lista={lista} conteos={conteos} foco={sp(q, "foco")} emojis={emojisDe(s.config.emojis_mapa)} encuadre={encuadre} />}
    </>
  );
}

function Listado({ lista, conteos, huellas }: { lista: Actividad[]; conteos: ReturnType<typeof conteosPorActividad>; huellas: ReturnType<typeof conteosHuellas> }) {
  if (!lista.length) return <Empty>No hay actividades con estos filtros.</Empty>;
  return (
    <div className="grid auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-3">
      {lista.map((a) => (
        <ActividadCard key={a.id} a={a} conteo={conteos.get(a.id)} huellas={huellas.get(a.id)} />
      ))}
    </div>
  );
}

const esInterior = (a: Actividad) => ambitoDe(a.zona) === "interior";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Leyenda corta: estados (color + texto) y, si hay actividades del interior, el ámbito. */
function LeyendaCalendario({ conInterior }: { conInterior: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-gris">
      {ESTADOS_ACTIVIDAD.map((e) => (
        <span key={e} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: ESTADO_HEX[e] }} aria-hidden /> {titulo(e)}
        </span>
      ))}
      {conInterior && (
        <span className="inline-flex items-center gap-3 border-l border-linea pl-4">
          <span>Ámbito:</span>
          <span className="inline-flex items-center gap-1">Capital</span>
          <span className="inline-flex items-center gap-1"><IconPin size={13} className="text-petroleo" /> Interior</span>
        </span>
      )}
    </div>
  );
}

/** Evento dentro de una celda: «16:00 · Nombre», con el color del estado (y un pin si es del interior). */
function EventoCalendario({ a }: { a: Actividad }) {
  const lugar = esInterior(a) ? `Interior · ${a.localidad || "sin localidad"}` : `Capital · ${ubicacionLabel(a)}`;
  return (
    <Link
      href={`/actividades/${a.id}`}
      className="flex items-start gap-1 rounded-md border-l-[3px] px-1.5 py-1 text-[12px] leading-tight text-tinta transition-[filter] hover:brightness-95"
      style={{ borderColor: ESTADO_HEX[a.estado], background: `${ESTADO_HEX[a.estado]}1a` }}
      title={`${a.hora_inicio ? `${a.hora_inicio} · ` : ""}${a.nombre}\n${lugar}\nEstado: ${titulo(a.estado)}`}
      aria-label={`${a.hora_inicio ? `${a.hora_inicio}, ` : ""}${a.nombre}. ${lugar}. Estado: ${titulo(a.estado)}`}
    >
      {esMarcandoHuellas(a) && <IconHuella size={12} className="mt-px shrink-0 text-marca" />}
      {esInterior(a) && <IconPin size={12} className="mt-px shrink-0 text-petroleo" />}
      {/* Nombre resumido: hasta 2 líneas (el completo está en la agenda, en el tooltip y en la ficha). */}
      <span className={cx("line-clamp-2 break-words", a.estado === "CANCELADA" && "line-through")}>
        {a.hora_inicio && <b className="font-bold">{a.hora_inicio} · </b>}
        {a.nombre}
      </span>
    </Link>
  );
}

function Calendario({ lista, anio, mes, keep, conteos, huellas }: { lista: Actividad[]; anio: number; mes: number; keep: Record<string, string | number | undefined>; conteos: ReturnType<typeof conteosPorActividad>; huellas: ReturnType<typeof conteosHuellas> }) {
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
  const delMes = conFecha.flatMap((d) => porDia.get(d)!);
  const inscriptosMes = delMes.reduce((n, a) => n + (conteos.get(a.id)?.inscriptos ?? 0), 0);
  const esMesActual = hoy.slice(0, 7) === fechaDe(1).slice(0, 7);
  const hoyMes = mesAnio(hoy);
  // Celda: hasta 3 actividades; si hay más, 2 y «+ N actividades».
  const visibles = (n: number) => (n <= 3 ? n : 2);

  return (
    <NavegarAgenda>
      {/* Navegación del mes: el mes actual es lo principal; anterior y siguiente, acciones secundarias. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href={`/calendario${qs({ ...keep, mes: ant.mes, anio: ant.anio })}`} className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-bold text-gris hover:bg-white hover:text-petroleo">
          <IconArrowLeft size={16} /> <span className="max-sm:sr-only">{nombreMes(ant.mes)}</span>
        </Link>
        <div className="text-center">
          <h2 className="font-titulo text-2xl font-extrabold tracking-tight sm:text-3xl">{nombreMes(mes)} {anio}</h2>
          {!esMesActual && (
            <Link href={`/calendario${qs({ ...keep, mes: hoyMes.mes, anio: hoyMes.anio })}`} className="text-xs font-bold text-petroleo hover:underline">
              Volver a hoy
            </Link>
          )}
        </div>
        <Link href={`/calendario${qs({ ...keep, mes: sig.mes, anio: sig.anio })}`} className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-bold text-gris hover:bg-white hover:text-petroleo">
          <span className="max-sm:sr-only">{nombreMes(sig.mes)}</span> <IconArrowRight size={16} />
        </Link>
      </div>

      <div className="mb-3">
        <LeyendaCalendario conInterior={lista.some(esInterior)} />
      </div>

      {/* Computadora y tablet: calendario mensual. */}
      <div className="overflow-hidden rounded-2xl border border-linea bg-white max-sm:hidden">
        <div className="grid grid-cols-7 border-b border-linea text-center text-xs font-bold tracking-wide text-gris uppercase">
          {DIAS.map((d, i) => (
            <div key={d} className={cx("py-2.5", i >= 5 && "bg-fondo/50")}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {celdas.map((d, i) => {
            const valido = d >= 1 && d <= diasMes;
            const acts = valido ? porDia.get(d) ?? [] : [];
            const esHoy = valido && fechaDe(d) === hoy;
            const finde = i % 7 >= 5;
            const n = visibles(acts.length);
            return (
              <div
                key={i}
                data-dia={acts.length ? d : undefined}
                className={cx(
                  "min-h-28 border-r border-b border-linea/70 p-1.5 lg:min-h-32",
                  (i + 1) % 7 === 0 && "border-r-0",
                  i >= celdas.length - 7 && "border-b-0",
                  !valido ? "bg-fondo/40" : finde ? "bg-fondo/50" : "bg-white",
                  esHoy && "bg-petroleo-50/60",
                  acts.length > 0 && "cursor-pointer hover:bg-petroleo-50/40",
                )}
              >
                {valido && (
                  <>
                    <div className="mb-1 flex items-center justify-between px-0.5">
                      <span className={cx("inline-flex size-7 items-center justify-center rounded-full text-[13px] font-bold", esHoy ? "bg-petroleo text-white" : acts.length ? "text-tinta" : "text-gris/70")}>
                        {d}
                      </span>
                      {esHoy && <span className="text-[10px] font-bold tracking-wide text-petroleo uppercase">Hoy</span>}
                    </div>
                    <ul className="space-y-1">
                      {acts.slice(0, n).map((a) => (
                        <li key={a.id}><EventoCalendario a={a} /></li>
                      ))}
                      {acts.length > n && (
                        <li>
                          <a href={`#dia-${d}`} data-ir-dia={d} className="block rounded-md px-1.5 py-0.5 text-[12px] font-bold text-petroleo hover:bg-petroleo-50">
                            + {acts.length - n} actividades
                          </a>
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Celular: mes chico con puntos (qué días tienen actividades); al tocar un día baja a la agenda. */}
      <div className="rounded-2xl border border-linea bg-white p-2 sm:hidden">
        <div className="grid grid-cols-7 text-center text-[11px] font-bold text-gris uppercase">
          {DIAS.map((d) => <div key={d} className="py-1">{d.slice(0, 2)}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {celdas.map((d, i) => {
            const valido = d >= 1 && d <= diasMes;
            const acts = valido ? porDia.get(d) ?? [] : [];
            const esHoy = valido && fechaDe(d) === hoy;
            if (!valido) return <div key={i} />;
            return (
              <button
                key={i}
                type="button"
                data-ir-dia={acts.length ? d : undefined}
                disabled={!acts.length}
                aria-label={`${d}: ${acts.length ? `${acts.length} ${acts.length === 1 ? "actividad" : "actividades"}` : "sin actividades"}`}
                className="flex min-h-12 flex-col items-center justify-start gap-1 rounded-xl py-1.5 enabled:active:bg-petroleo-50"
              >
                <span className={cx("inline-flex size-7 items-center justify-center rounded-full text-sm font-bold", esHoy ? "bg-petroleo text-white" : acts.length ? "text-tinta" : "text-gris/50")}>{d}</span>
                <span className="flex gap-0.5" aria-hidden>
                  {acts.slice(0, 3).map((a) => <span key={a.id} className="size-1.5 rounded-full" style={{ background: ESTADO_HEX[a.estado] }} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Agenda: el detalle de cada día (mismas actividades y mismos filtros que el calendario). */}
      <section className="mt-8" aria-labelledby="agenda-titulo">
        <h2 id="agenda-titulo" className="font-titulo text-xl font-extrabold">Agenda de {nombreMes(mes).toLowerCase()}</h2>
        <p className="mb-4 text-[15px] text-gris">
          <b className="text-tinta">{delMes.length}</b> {delMes.length === 1 ? "actividad" : "actividades"} · <b className="text-tinta">{inscriptosMes}</b> {inscriptosMes === 1 ? "inscripto" : "inscriptos"}
        </p>
        {conFecha.length === 0 ? (
          <Empty>No hay actividades este mes con estos filtros.</Empty>
        ) : (
          <ol className="space-y-5">
            {conFecha.map((d) => {
              const acts = porDia.get(d)!;
              const fecha = fechaDe(d);
              return (
                <li key={d} id={`dia-${d}`} className="scroll-mt-24 rounded-2xl transition-colors duration-700 data-[resaltado]:bg-petroleo-50 data-[resaltado]:ring-2 data-[resaltado]:ring-petroleo/30">
                  <h3 className="mb-2 flex items-baseline gap-2 px-1 pt-1">
                    <span className="font-titulo text-[15px] font-bold first-letter:uppercase">{formatDate(fecha, { weekday: "long", day: "numeric", month: "long" })}</span>
                    {acts.length > 1 && <span className="text-sm text-gris">· {acts.length} actividades</span>}
                    {fecha === hoy && <span className="rounded-full bg-petroleo px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">Hoy</span>}
                  </h3>
                  <div className="space-y-2">
                    {acts.map((a) => {
                      const inscriptos = conteos.get(a.id)?.inscriptos ?? 0;
                      const donde = esInterior(a)
                        ? [a.localidad, zonaLabel(a.zona), a.barrio && titleCase(a.barrio), a.lugar].filter(Boolean).join(" · ")
                        : [zonaLabel(a.zona), a.barrio && titleCase(a.barrio), a.lugar].filter(Boolean).join(" · ");
                      return (
                        <Link key={a.id} href={`/actividades/${a.id}`} className="flex items-stretch gap-3 rounded-xl border border-linea bg-white p-3 transition-colors hover:border-petroleo sm:p-3.5">
                          <span className="w-1.5 shrink-0 rounded-full" style={{ background: ESTADO_HEX[a.estado] }} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-bold tracking-[0.12em] text-gris uppercase">
                              {esInterior(a) ? <span className="inline-flex items-center gap-1"><IconPin size={12} className="text-petroleo" /> Interior · {a.localidad || "sin localidad"}</span> : "Capital"}
                            </span>
                            <span className={cx("mt-0.5 block font-titulo text-[17px] leading-snug font-bold", a.estado === "CANCELADA" && "line-through decoration-gris/60")}>{a.nombre}</span>
                            <span className="mt-0.5 block text-sm text-gris">
                              <b className="font-semibold text-tinta">{a.hora_inicio ? `${a.hora_inicio}${a.hora_fin ? `–${a.hora_fin}` : ""}` : "Sin horario"}</b> · {donde}
                            </span>
                            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <EstadoBadge estado={a.estado} />
                              <GuiaBadge a={a} />
                              {esMarcandoHuellas(a) ? (
                                <span className="inline-flex items-center gap-1 text-sm font-semibold text-marca-600">
                                  <IconHuella size={15} /> {huellas.get(a.id)?.animales ? `${huellas.get(a.id)!.animales} animales atendidos` : "Vacunación y desparasitación"}
                                </span>
                              ) : (
                                inscriptos > 0 && <span className="inline-flex items-center gap-1 text-sm font-semibold"><IconUsers size={15} /> {inscriptos} {inscriptos === 1 ? "inscripto" : "inscriptos"}</span>
                              )}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {lista.some((a) => !a.fecha) && <Notice className="mt-3">Hay actividades sin fecha (borradores): aparecen en el listado.</Notice>}
      </section>
    </NavegarAgenda>
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
