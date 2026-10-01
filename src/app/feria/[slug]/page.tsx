import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CroquisVista } from "@/components/croquis";
import { CroquisAuto } from "@/components/croquis-auto";
import { SelloLista47 } from "@/components/ui";
import { snapshot } from "@/lib/db";
import { TIPO_PUESTO_HEX, TIPO_PUESTO_LABEL } from "@/lib/ferias";
import { ferianteActivas, puestosDe } from "@/lib/services/ferias";
import { formatDate } from "@/lib/util";

/**
 * Croquis PÚBLICO de una feria: el lugar con los puestos numerados y el listado (nombre y emprendimiento).
 * Es lo que reciben las feriantes por WhatsApp; ?p=12 destaca su puesto. Nunca muestra teléfonos ni DNI.
 */

export const metadata: Metadata = { title: "Croquis de la feria", robots: { index: false } };

export default async function CroquisPublico({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ p?: string }> }) {
  await connection();
  const { slug } = await params;
  const { p } = await searchParams;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.slug === slug && x.es_feria);
  if (!a) notFound();
  const puestos = puestosDe(s, a.id);
  const personas = new Map(s.participantes.map((x) => [x.id, x]));
  const activas = ferianteActivas(s, a.id);
  const destacado = Number(p) || 0;
  const delPuesto = (n: number) =>
    activas.filter((f) => f.puesto === n).map((f) => {
      const x = personas.get(f.participante_id);
      return { nombre: x ? `${x.nombre} ${x.apellido}`.trim() : "", emprendimiento: f.emprendimiento };
    });
  const mio = destacado ? puestos.find((x) => x.numero === destacado) : undefined;

  return (
    <div className="tema-feria min-h-dvh bg-fondo">
      <header className="feria-degradado px-4 pt-8 pb-16 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <SelloLista47 size={52} />
          <div>
            <p className="font-titulo text-4xl leading-none font-black tracking-tight uppercase italic">Feria</p>
            <h1 className="mt-1 font-titulo text-xl leading-tight font-extrabold">{a.nombre}</h1>
            <p className="text-sm text-white/85 first-letter:uppercase">
              {[a.fecha && formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }), a.hora_inicio && `${a.hora_inicio} h`, a.lugar].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </header>
      <main className="relative mx-auto -mt-10 max-w-6xl px-4 pb-12">
        {mio && (
          <div className="mb-4 rounded-3xl bg-white p-4 text-center shadow-lg ring-4 ring-feria-lima">
            <p className="text-sm font-bold text-gris uppercase">Tu puesto</p>
            <p className="font-titulo text-5xl font-extrabold" style={{ color: TIPO_PUESTO_HEX[mio.tipo] }}>N° {mio.numero}</p>
            <p className="text-[15px] text-gris">{TIPO_PUESTO_LABEL[mio.tipo]} · está marcado en amarillo en el croquis.</p>
          </div>
        )}
        {puestos.length ? (
          <div className="rounded-2xl bg-white p-2 shadow-lg ring-1 ring-linea">
            <CroquisAuto puestos={puestos.map((x) => ({ numero: x.numero, tipo: x.tipo, nombres: delPuesto(x.numero).map((q) => q.emprendimiento) }))} destacado={destacado} />
          </div>
        ) : (
          <p className="rounded-2xl bg-white p-5 text-center ring-1 ring-linea">El croquis todavía no está disponible.</p>
        )}
        {a.croquis && puestos.some((x) => x.x || x.y) && (
          <section className="mt-6">
            <h2 className="mb-2 text-lg font-extrabold">Plano del lugar</h2>
            <div className="rounded-2xl bg-white p-2 ring-1 ring-linea">
              <CroquisVista url={a.croquis} puestos={puestos} destacado={destacado} />
            </div>
          </section>
        )}
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-extrabold">Listado de puestos</h2>
          <ol className="divide-y divide-linea overflow-hidden rounded-2xl bg-white ring-1 ring-linea">
            {puestos.map((x) => {
              const quienes = delPuesto(x.numero);
              return (
                <li key={x.numero} className={`flex gap-3 px-4 py-2.5 ${x.numero === destacado ? "bg-amber-50" : ""}`}>
                  <span className="w-10 shrink-0 text-right font-extrabold" style={{ color: TIPO_PUESTO_HEX[x.tipo] }}>{x.numero}</span>
                  <span className="min-w-0 text-[15px]">
                    {quienes.length ? quienes.map((q, i) => <span key={i} className="block"><b>{q.emprendimiento}</b> · {q.nombre}</span>) : <span className="text-gris">—</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </div>
  );
}
