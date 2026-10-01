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
  const barrios = s.barrios.filter((b) => b.activo).map((b) => b.barrio).sort();
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
        <article className="rounded-3xl bg-white p-5 shadow-lg ring-1 ring-linea sm:p-7">
          {a.tipo && <p className="mb-1 text-xs font-bold tracking-[0.2em] text-marca uppercase">{a.tipo}</p>}
          <h1 className="text-[26px] leading-tight font-extrabold">{a.nombre}</h1>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[15px]">
            <div>
              <dt className="text-xs font-bold tracking-wide text-gris uppercase">Cuándo</dt>
              <dd className="font-semibold first-letter:uppercase">
                {a.fecha ? formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "A confirmar"}
                {a.hora_inicio && <><br />{a.hora_inicio}{a.hora_fin && ` a ${a.hora_fin}`} h</>}
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

        <section className="mt-6" aria-labelledby="form-titulo">
          {!abierta.abierta ? (
            <p className="rounded-2xl bg-white p-5 text-center text-[16px] ring-1 ring-linea">{abierta.motivo}</p>
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
              <h2 id="form-titulo" className="mb-1 text-2xl font-extrabold">Inscribite</h2>
              <p className="mb-5 text-[15px] text-gris">Te lleva un minuto.</p>
              <InscripcionForm slug={a.slug} token={formToken()} preguntas={preguntas} barrios={barrios} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
