import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SelloLista47 } from "@/components/ui";
import { formToken } from "@/lib/antispam";
import { parsePreguntas } from "@/lib/preguntas";
import { snapshot } from "@/lib/db";
import { formatDate, titleCase } from "@/lib/util";
import { inscripcionAbiertaPublica } from "@/lib/services/inscripciones";
import { lugaresLibres } from "@/lib/services/ferias";
import { IconosFeria } from "@/components/feria-ui";
import { IconCalendar, IconClock, IconHeart, IconPin } from "@/components/icons";
import { rubroDe } from "@/components/taller";
import { fechasDeClases } from "@/lib/clases";
import { linkCalendario } from "@/lib/compartir";
import { CIUDAD_CAPITAL, esTallerEscuela, preguntasSinRepetir } from "@/lib/inscripcion-publica";
import type { Actividad } from "@/lib/schema";
import { nombrePropio, parseRegiones } from "@/lib/territorio";
import { FeriaForm } from "./feria-form";
import { InscripcionForm } from "./inscripcion-form";

/**
 * Formulario PÚBLICO de inscripción (sin usuario ni contraseña).
 * Solo muestra datos públicos de la actividad; nunca datos de otras personas.
 */

async function getActividad(slug: string) {
  const s = await snapshot();
  const a = s.actividades.find((x) => x.slug === slug);
  return a ? { a, s } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getActividad(slug).catch(() => null);
  if (!r) return { title: "Inscripción" };
  return {
    title: { absolute: `Inscripción: ${r.a.nombre} · Lista 47` },
    description: r.a.detalle.slice(0, 160) || `Inscribite a ${r.a.nombre}.`,
    openGraph: { title: r.a.nombre, description: r.a.detalle.slice(0, 160) },
    robots: { index: false },
  };
}

export default async function FormularioPublico({ params }: { params: Promise<{ slug: string }> }) {
  await connection(); // siempre datos frescos
  const { slug } = await params;
  const r = await getActividad(slug);
  if (!r) notFound();
  const { a, s } = r;
  const abierta = inscripcionAbiertaPublica(a);
  const preguntas = parsePreguntas(a.preguntas_extra);
  const escuela = esTallerEscuela(a);
  const barrios = s.barrios.filter((b) => b.activo).map((b) => b.barrio).sort();
  // Ciudad: Capital primero; después las localidades del interior configuradas. Si el taller es en el interior, viene elegida esa.
  const localidades = parseRegiones(s.config.regiones_interior).flatMap((r) => r.localidades);
  const ciudadInicial = a.localidad ? nombrePropio(a.localidad) : CIUDAD_CAPITAL;
  const ciudades = [...new Set([CIUDAD_CAPITAL, ciudadInicial, ...localidades.sort((x, y) => x.localeCompare(y))])];
  const cuando = a.fecha ? formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "";
  const horario = a.hora_inicio ? `${a.hora_inicio}${a.hora_fin ? ` a ${a.hora_fin}` : ""} h` : "";
  const libres = a.es_feria ? lugaresLibres(a, s) : null;
  // Rubros que ya usaron otras feriantes (sugerencias para escribir igual).
  const rubros = a.es_feria ? [...new Set(s.feriantes.map((f) => f.rubro).filter(Boolean))].sort().slice(0, 40) : [];

  return (
    <div className={a.es_feria ? "tema-feria min-h-dvh bg-fondo" : "min-h-dvh bg-fondo"}>
      <header className={a.es_feria ? "feria-degradado relative overflow-hidden px-4 pt-8 pb-24 text-white" : "bg-institucional px-4 pt-8 pb-20 text-white"}>
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <SelloLista47 size={56} />
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-white/80 uppercase">Coalición Cívica ARI · Corrientes</p>
            <p className="font-titulo text-lg font-extrabold">Cuqui Calvano · Lista 47</p>
          </div>
        </div>
        {a.es_feria && (
          <div className="mx-auto mt-4 max-w-xl">
            <p className="font-titulo text-5xl leading-none font-black tracking-tight uppercase italic drop-shadow-sm">Feria</p>
            <p className="mt-1 font-titulo text-lg font-extrabold">Emprendedoras ESME</p>
            <IconosFeria className="mt-3" size={20} />
          </div>
        )}
      </header>

      <main className="relative mx-auto -mt-14 max-w-xl px-4 pb-12">
        {a.es_feria ? (
          <article className="rounded-3xl bg-white p-5 shadow-lg ring-1 ring-linea sm:p-7">
            {a.tipo && <p className="mb-1 text-xs font-bold tracking-[0.2em] text-marca uppercase">{a.tipo}</p>}
            <h1 className="text-[26px] leading-tight font-extrabold">{a.nombre}</h1>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[15px]">
              <div>
                <dt className="text-xs font-bold tracking-wide text-gris uppercase">Cuándo</dt>
                <dd className="font-semibold first-letter:uppercase">
                  {cuando || "A confirmar"}
                  {horario && <><br />{horario}</>}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold tracking-wide text-gris uppercase">Dónde</dt>
                <dd className="font-semibold">
                  {[a.lugar, a.direccion].filter(Boolean).join(" · ") || "A confirmar"}
                  {a.barrio && <><br />Barrio {titleCase(a.barrio)}</>}
                </dd>
              </div>
            </dl>
            {a.detalle && <p className="mt-4 text-[16px] leading-relaxed whitespace-pre-line text-gris">{a.detalle}</p>}
          </article>
        ) : (
          <TarjetaTaller a={a} cuando={cuando} horario={horario} />
        )}

        <section className="mt-6" aria-labelledby={a.es_feria ? "form-titulo" : undefined}>
          {!abierta.abierta ? (
            <p className="rounded-2xl bg-white p-5 text-center text-[17px] ring-1 ring-linea">{abierta.motivo}</p>
          ) : a.es_feria ? (
            libres === 0 ? (
              <p className="rounded-2xl bg-white p-5 text-center text-[16px] font-semibold ring-1 ring-linea">
                ¡Se completó el cupo de esta feria! Gracias por tu interés: vas a tener oportunidad en la próxima.
              </p>
            ) : (
              <>
                <h2 id="form-titulo" className="mb-1 text-2xl font-extrabold">Reservá tu lugar</h2>
                <p className="mb-5 text-[15px] text-gris">
                  Cupo limitado{libres !== null && libres <= 15 ? `: quedan ${libres} ${libres === 1 ? "lugar" : "lugares"}` : ""}. Te lleva un minuto.
                </p>
                <FeriaForm slug={a.slug} token={formToken()} rubros={rubros} />
              </>
            )
          ) : (
            <>
              <div className="mb-5 flex items-start gap-3 px-1">
                <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-verde-50 text-marca" aria-hidden>
                  <IconHeart size={24} fill="currentColor" strokeWidth={0} />
                </span>
                <div>
                  <p className="font-titulo text-[22px] leading-tight font-extrabold text-petroleo-600">¡Qué bueno que quieras participar!</p>
                  <p className="mt-1 text-[17px] leading-snug text-tinta">Completá tus datos para reservar tu lugar. Te va a llevar menos de 2 minutos.</p>
                </div>
              </div>
              <InscripcionForm
                slug={a.slug}
                token={formToken()}
                preguntas={preguntasSinRepetir(preguntas, escuela)}
                barrios={barrios}
                ciudades={ciudades}
                ciudadInicial={ciudadInicial}
                escuela={escuela}
                taller={{
                  nombre: a.nombre,
                  cuando: cuando || "Fecha a confirmar",
                  horario,
                  lugar: a.lugar,
                  direccion: [a.direccion, a.barrio && `Barrio ${nombrePropio(a.barrio)}`, a.localidad].filter(Boolean).join(" · "),
                  calendario: linkCalendario(a),
                }}
              />
            </>
          )}
        </section>
      </main>
    </div>
  );
}

/** Encabezado del taller: qué es, cuándo y dónde, bien grande y fácil de leer. */
function TarjetaTaller({ a, cuando, horario }: { a: Actividad; cuando: string; horario: string }) {
  const { Icon } = rubroDe(a);
  const mapa = a.lat && a.lng ? `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}` : "";
  return (
    <article className="rounded-[28px] bg-white p-5 shadow-[0_8px_24px_rgba(16,105,133,0.10)] ring-1 ring-linea sm:p-7">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-verde-50 text-marca" aria-hidden>
          <Icon size={26} />
        </span>
        <p className="text-[14px] font-extrabold tracking-[0.18em] text-marca uppercase">{!a.tipo || /esme|taller|capacitaci/i.test(a.tipo) ? "Taller" : titleCase(a.tipo)}</p>
      </div>
      <h1 className="mt-3 font-titulo text-[30px] leading-[1.12] font-black text-petroleo-600 sm:text-[34px]">{a.nombre}</h1>
      <ul className="mt-5 space-y-3.5 text-[17px] leading-snug">
        <li className="flex items-start gap-3">
          <IconCalendar size={22} className="mt-0.5 shrink-0 text-petroleo" />
          <span>
            <span className="block font-bold first-letter:uppercase">{cuando || "Fecha a confirmar"}</span>
            {fechasDeClases(a).length > 1 && (
              <span className="block text-[15px] text-gris">
                {fechasDeClases(a).length} clases: {fechasDeClases(a).map((f) => formatDate(f, { weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, "")).join(" · ")}
              </span>
            )}
          </span>
        </li>
        {horario && (
          <li className="flex items-start gap-3">
            <IconClock size={22} className="mt-0.5 shrink-0 text-petroleo" />
            <span className="font-bold">{horario}</span>
          </li>
        )}
        <li className="flex items-start gap-3">
          <IconPin size={22} className="mt-0.5 shrink-0 text-petroleo" />
          <span>
            {a.lugar && <b className="block">{a.lugar}</b>}
            {a.direccion && <span className="block">{a.direccion}</span>}
            {a.barrio && <span className="block">Barrio {nombrePropio(a.barrio)}</span>}
            {a.localidad && <span className="block">{a.localidad}</span>}
            {!a.lugar && !a.direccion && !a.barrio && "Lugar a confirmar"}
            {mapa && (
              <a href={mapa} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center font-bold text-petroleo underline underline-offset-4">
                Ver en el mapa
              </a>
            )}
          </span>
        </li>
      </ul>
      {a.detalle && <p className="mt-5 border-t border-linea pt-4 text-[17px] leading-relaxed whitespace-pre-line text-tinta">{a.detalle}</p>}
    </article>
  );
}
