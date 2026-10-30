import Link from "next/link";
import { BotonImprimir } from "@/components/boton-imprimir";
import { IconArrowLeft, IconArrowRight } from "@/components/icons";
import { cx, SelloLista47 } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fechasDeClases } from "@/lib/clases";
import { snapshot } from "@/lib/db";
import { conteosPorActividad, filtrarActividades } from "@/lib/domain/metricas";
import { titulo, ubicacionLabel } from "@/lib/labels";
import type { Actividad } from "@/lib/schema";
import { ambitoDe } from "@/lib/territorio";
import { addMonths, formatDate, nombreMes, titleCase, today } from "@/lib/util";
import { filtrosDe, qs, type SP } from "@/lib/view";

export const metadata = { title: "Línea de tiempo" };

const AMBITOS = [
  ["", "Toda la provincia"],
  ["capital", "Capital"],
  ["interior", "Interior"],
] as const;

interface Encuentro {
  a: Actividad;
  fecha: string;
  clase: number; // 0 = actividad de un solo día
  clases: number;
}

/**
 * Línea de tiempo del mes (informe para descargar en PDF): todas las actividades día por día, con los datos básicos.
 * Mismos filtros que el calendario (Capital / Interior / toda la provincia, zona, tipo…). Los talleres de varias clases aparecen en cada clase.
 */
export default async function LineaDeTiempo({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const q = await searchParams;
  const f = filtrosDe(q);
  const hoy = today();
  const anio = f.anio || Number(hoy.slice(0, 4));
  const mes = f.mes || Number(hoy.slice(5, 7));
  const ambito = f.ambito === "capital" || f.ambito === "interior" ? f.ambito : "";
  const prefijo = `${anio}-${String(mes).padStart(2, "0")}`;

  const s = await snapshot();
  const conteos = conteosPorActividad(s);
  // Como el calendario: todas las actividades (sin borradores ni canceladas), con los demás filtros elegidos.
  const actividades = filtrarActividades(
    s.actividades.filter((a) => a.estado !== "BORRADOR" && a.estado !== "CANCELADA"),
    { ...f, ambito, anio: 0, mes: 0 },
  );
  const encuentros: Encuentro[] = actividades
    .flatMap((a) => {
      const fechas = fechasDeClases(a);
      return fechas.map((fecha, i) => ({ a, fecha, clase: fechas.length > 1 ? i + 1 : 0, clases: fechas.length }));
    })
    .filter((e) => e.fecha.startsWith(prefijo))
    .sort((x, y) => (x.fecha + (x.a.hora_inicio || "99")).localeCompare(y.fecha + (y.a.hora_inicio || "99")) || x.a.nombre.localeCompare(y.a.nombre));

  const dias = [...new Set(encuentros.map((e) => e.fecha))];
  const distintas = new Set(encuentros.map((e) => e.a.id));
  const enCapital = new Set(encuentros.filter((e) => ambitoDe(e.a.zona) === "capital").map((e) => e.a.id)).size;
  const tipos = new Map<string, number>();
  for (const id of distintas) {
    const t = titulo(s.actividades.find((x) => x.id === id)?.tipo || "Sin tipo");
    tipos.set(t, (tipos.get(t) ?? 0) + 1);
  }
  const masTipos = [...tipos.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);

  const filtros = { zona: f.zona, localidad: f.localidad, barrio: f.barrio, responsable: f.responsable, tipo: f.tipo, estado: f.estado, q: f.q };
  const link = (cambios: { anio?: number; mes?: number; ambito?: string }) =>
    `/calendario/linea-de-tiempo${qs({ ...filtros, ambito, anio, mes, ...cambios })}`;
  const anterior = addMonths(anio, mes, -1);
  const siguiente = addMonths(anio, mes, 1);
  const etiquetaAmbito = AMBITOS.find(([id]) => id === ambito)![1];
  const extra = [f.zona && titleCase(f.zona), f.tipo, f.barrio && `Barrio ${titleCase(f.barrio)}`, f.responsable].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-3xl">
      {/* Controles (no salen en el PDF). */}
      <div className="mb-4 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/calendario${qs({ ...filtros, ambito, anio, mes })}`} className="text-sm font-bold text-petroleo hover:underline">← Volver al calendario</Link>
          <BotonImprimir />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={link(anterior)} className="flex size-10 items-center justify-center rounded-full border border-linea bg-white text-petroleo" aria-label="Mes anterior"><IconArrowLeft size={18} /></Link>
          <span className="min-w-36 text-center font-titulo text-lg font-extrabold">{nombreMes(mes)} {anio}</span>
          <Link href={link(siguiente)} className="flex size-10 items-center justify-center rounded-full border border-linea bg-white text-petroleo" aria-label="Mes siguiente"><IconArrowRight size={18} /></Link>
          <span className="mx-1 h-6 w-px bg-linea" aria-hidden />
          {AMBITOS.map(([id, label]) => (
            <Link
              key={id}
              href={link({ ambito: id })}
              aria-current={ambito === id ? "page" : undefined}
              className={cx("inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-bold", ambito === id ? "border-marca bg-verde-50 text-marca-600" : "border-linea bg-white text-gris hover:border-petroleo")}
            >
              {label}
            </Link>
          ))}
        </div>
        <p className="text-sm text-gris">Para guardarlo, tocá «Imprimir / guardar PDF» y elegí «Guardar como PDF».</p>
      </div>

      {/* Informe */}
      <article className="rounded-3xl border border-linea bg-white p-5 sm:p-7 print:rounded-none print:border-0 print:p-0">
        <header className="flex items-center gap-3 border-b border-linea pb-4">
          <SelloLista47 size={52} />
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.18em] text-gris uppercase">Coalición Cívica ARI · Lista 47</p>
            <h1 className="font-titulo text-2xl leading-tight font-black text-petroleo-600">Actividades de {nombreMes(mes).toLowerCase()} {anio}</h1>
            <p className="text-[15px] font-semibold text-tinta">{etiquetaAmbito}{extra ? ` · ${extra}` : ""}</p>
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato k="Actividades" v={distintas.size} />
          <Dato k="Encuentros" v={encuentros.length} />
          <Dato k="Días con actividad" v={dias.length} />
          {ambito ? <Dato k="Tipos" v={tipos.size} /> : <Dato k="Capital / Interior" v={`${enCapital} / ${distintas.size - enCapital}`} />}
        </dl>
        {masTipos.length > 0 && (
          <p className="mt-2 text-[13.5px] text-gris">
            <b className="text-tinta">Por tipo:</b> {masTipos.map(([t, n]) => `${t} (${n})`).join(" · ")}
            {tipos.size > masTipos.length ? " · otros" : ""}
          </p>
        )}

        {!encuentros.length ? (
          <p className="mt-6 rounded-2xl bg-fondo p-5 text-center text-gris">No hay actividades cargadas para {nombreMes(mes).toLowerCase()} con estos filtros.</p>
        ) : (
          <ol className="mt-6">
            {dias.map((dia) => (
              <li key={dia} className="relative pb-5 pl-7 last:pb-0">
                {/* Línea y punto de la línea de tiempo. */}
                <span aria-hidden className="absolute top-2 bottom-0 left-[7px] w-0.5 bg-linea" />
                <span aria-hidden className="absolute top-1.5 left-0 size-4 rounded-full border-[3px] border-white bg-marca ring-2 ring-marca" />
                <h2 className="mb-2 font-titulo text-[17px] font-extrabold text-tinta first-letter:uppercase print:break-after-avoid">
                  {formatDate(dia, { weekday: "long", day: "numeric", month: "long" })}
                </h2>
                <ul className="space-y-2">
                  {encuentros.filter((e) => e.fecha === dia).map((e) => {
                    const a = e.a;
                    const lugar = [a.lugar, a.direccion].filter(Boolean).join(", ");
                    const inscriptos = conteos.get(a.id)?.inscriptos ?? 0;
                    return (
                      <li key={`${a.id}-${e.clase}`} className="break-inside-avoid rounded-2xl border border-linea p-3">
                        <div className="flex items-start gap-3">
                          <span className="w-14 shrink-0 font-titulo text-[15px] font-extrabold text-petroleo-600 tabular-nums">{a.hora_inicio || "—"}</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold leading-snug">
                              {a.nombre}
                              {e.clase > 0 && <span className="ml-1.5 text-[13px] font-semibold text-gris">(clase {e.clase} de {e.clases})</span>}
                            </p>
                            <p className="mt-0.5 text-[13.5px] leading-snug text-gris">
                              {[
                                a.tipo && titulo(a.tipo),
                                ubicacionLabel(a),
                                lugar,
                                a.barrio && ambitoDe(a.zona) === "capital" && `Barrio ${titleCase(a.barrio)}`,
                              ].filter(Boolean).join(" · ")}
                            </p>
                            <p className="mt-0.5 text-[13.5px] leading-snug text-gris">
                              {[
                                a.hora_fin && a.hora_inicio && `${a.hora_inicio} a ${a.hora_fin} h`,
                                a.responsable && `Responsable: ${titleCase(a.responsable)}`,
                                inscriptos > 0 && `${inscriptos} inscriptos${a.cupo ? ` de ${a.cupo}` : ""}`,
                              ].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          {a.estado !== "CONFIRMADA" && a.estado !== "PROGRAMADA" && (
                            <span className="shrink-0 rounded-full bg-fondo px-2 py-0.5 text-[11.5px] font-bold text-gris uppercase">{titulo(a.estado)}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-6 border-t border-linea pt-3 text-[12px] text-gris">
          Generado el {formatDate(hoy, { day: "numeric", month: "long", year: "numeric" })} desde Gestión Territorial · Lista 47. No incluye actividades canceladas ni borradores.
        </p>
      </article>
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="rounded-2xl bg-fondo px-3 py-2">
      <dt className="text-[11.5px] font-bold tracking-wide text-gris uppercase">{k}</dt>
      <dd className="font-titulo text-2xl font-black tabular-nums">{v}</dd>
    </div>
  );
}
