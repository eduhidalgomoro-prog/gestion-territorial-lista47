import Link from "next/link";
import { IconArrowLeft, IconArrowRight, IconDownload } from "@/components/icons";
import { cx, SelloLista47 } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { AMBITOS, lineaDeTiempo } from "@/lib/linea-de-tiempo";
import { addMonths, formatDate, nombreMes, today } from "@/lib/util";
import { filtrosDe, qs, type SP } from "@/lib/view";

export const metadata = { title: "Línea de tiempo" };

/**
 * Línea de tiempo del mes: todas las actividades día por día, con los datos básicos, y el PDF para descargar.
 * Mismos filtros que el calendario (Capital / Interior / toda la provincia, zona, tipo…).
 */
export default async function LineaDeTiempo({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const f = filtrosDe(await searchParams);
  const hoy = today();
  const anio = f.anio || Number(hoy.slice(0, 4));
  const mes = f.mes || Number(hoy.slice(5, 7));
  const { ambito, etiquetaAmbito, dias, resumen } = lineaDeTiempo(await snapshot(), f, anio, mes);

  const filtros = { zona: f.zona, localidad: f.localidad, barrio: f.barrio, responsable: f.responsable, tipo: f.tipo, estado: f.estado, q: f.q };
  const params = (cambios: { anio?: number; mes?: number; ambito?: string } = {}) => qs({ ...filtros, ambito, anio, mes, ...cambios });
  const anterior = addMonths(anio, mes, -1);
  const siguiente = addMonths(anio, mes, 1);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/calendario${params()}`} className="text-sm font-bold text-petroleo hover:underline">← Volver al calendario</Link>
          <a href={`/calendario/linea-de-tiempo/pdf${params()}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-marca px-4 text-[15px] font-bold text-white hover:bg-marca-600">
            <IconDownload size={18} /> Descargar PDF
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/calendario/linea-de-tiempo${params(anterior)}`} className="flex size-10 items-center justify-center rounded-full border border-linea bg-white text-petroleo" aria-label="Mes anterior"><IconArrowLeft size={18} /></Link>
          <span className="min-w-36 text-center font-titulo text-lg font-extrabold">{nombreMes(mes)} {anio}</span>
          <Link href={`/calendario/linea-de-tiempo${params(siguiente)}`} className="flex size-10 items-center justify-center rounded-full border border-linea bg-white text-petroleo" aria-label="Mes siguiente"><IconArrowRight size={18} /></Link>
          <span className="mx-1 h-6 w-px bg-linea" aria-hidden />
          {AMBITOS.map(([id, label]) => (
            <Link
              key={id}
              href={`/calendario/linea-de-tiempo${params({ ambito: id })}`}
              aria-current={ambito === id ? "page" : undefined}
              className={cx("inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-bold", ambito === id ? "border-marca bg-verde-50 text-marca-600" : "border-linea bg-white text-gris hover:border-petroleo")}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <article className="rounded-3xl border border-linea bg-white p-5 sm:p-7">
        <header className="flex items-center gap-3 border-b border-linea pb-4">
          <SelloLista47 size={52} />
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.18em] text-gris uppercase">Coalición Cívica ARI · Lista 47</p>
            <h1 className="font-titulo text-2xl leading-tight font-black text-petroleo-600">Actividades de {nombreMes(mes).toLowerCase()} {anio}</h1>
            <p className="text-[15px] font-semibold text-tinta">{etiquetaAmbito}</p>
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato k="Actividades" v={resumen.actividades} />
          <Dato k="Encuentros" v={resumen.encuentros} />
          <Dato k="Días con actividad" v={resumen.dias} />
          {ambito ? <Dato k="Tipos" v={resumen.tipos} /> : <Dato k="Capital / Interior" v={`${resumen.capital} / ${resumen.interior}`} />}
        </dl>
        {resumen.porTipo && resumen.actividades > 0 && (
          <p className="mt-2 text-[13.5px] text-gris"><b className="text-tinta">Por tipo:</b> {resumen.porTipo}</p>
        )}

        {!dias.length ? (
          <p className="mt-6 rounded-2xl bg-fondo p-5 text-center text-gris">No hay actividades cargadas para {nombreMes(mes).toLowerCase()} con estos filtros.</p>
        ) : (
          <ol className="mt-6">
            {dias.map((d) => (
              <li key={d.fecha} className="relative pb-5 pl-7 last:pb-0">
                <span aria-hidden className="absolute top-2 bottom-0 left-[7px] w-0.5 bg-linea" />
                <span aria-hidden className="absolute top-1.5 left-0 size-4 rounded-full border-[3px] border-white bg-marca ring-2 ring-marca" />
                <h2 className="mb-2 font-titulo text-[17px] font-extrabold text-tinta first-letter:uppercase">
                  {formatDate(d.fecha, { weekday: "long", day: "numeric", month: "long" })}
                </h2>
                <ul className="space-y-2">
                  {d.encuentros.map((e) => (
                    <li key={`${e.id}-${e.clase}`} className="rounded-2xl border border-linea p-3">
                      <div className="flex items-start gap-3">
                        <span className="w-14 shrink-0 font-titulo text-[15px] font-extrabold text-petroleo-600 tabular-nums">{e.hora || "—"}</span>
                        <div className="min-w-0 flex-1">
                          <p className="leading-snug font-bold">
                            {e.nombre}
                            {e.clase && <span className="ml-1.5 text-[13px] font-semibold text-gris">({e.clase})</span>}
                          </p>
                          <p className="mt-0.5 text-[13.5px] leading-snug text-gris">{e.detalle}</p>
                          <p className="mt-0.5 text-[13.5px] leading-snug text-gris">{[e.horario, e.responsable && `Responsable: ${e.responsable}`, e.inscriptos].filter(Boolean).join(" · ")}</p>
                        </div>
                        {e.estado && <span className="shrink-0 rounded-full bg-fondo px-2 py-0.5 text-[11.5px] font-bold text-gris uppercase">{e.estado}</span>}
                      </div>
                    </li>
                  ))}
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
