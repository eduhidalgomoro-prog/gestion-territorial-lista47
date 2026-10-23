import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BotonImprimir } from "@/components/boton-imprimir";
import { InformePublico } from "@/components/informe-publico";
import { SelloLista47 } from "@/components/ui";
import { snapshot } from "@/lib/db";
import { armarInforme } from "@/lib/informe";
import { firmaValida } from "@/lib/informe-link";
import { formatDate } from "@/lib/util";

/**
 * Informe del público PARA EL DISERTANTE (sin usuario): /informe/<id>?k=<firma>.
 * Sin la firma correcta no existe. Solo cantidades y respuestas sin nombre: nunca nombres, teléfonos ni DNI.
 */

export const metadata: Metadata = { title: "Informe del público", robots: { index: false } };

export default async function InformeDisertante({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  await connection(); // siempre datos frescos
  const { id } = await params;
  const { k } = await searchParams;
  if (!k || !firmaValida(id, k)) notFound();
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a) notFound();
  const informe = armarInforme(a, s.inscripciones, s.participantes);
  return (
    <div className="min-h-dvh bg-fondo">
      <header className="bg-institucional px-4 pt-8 pb-16 text-white print:bg-white print:pb-4 print:text-tinta">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <SelloLista47 size={52} />
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-white/80 uppercase print:text-gris">Informe del público</p>
            <h1 className="mt-1 font-titulo text-2xl leading-tight font-extrabold">{a.nombre}</h1>
            <p className="text-sm text-white/85 first-letter:uppercase print:text-gris">
              {[a.fecha && formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }), a.hora_inicio && `${a.hora_inicio} h`].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </header>
      <main className="relative mx-auto -mt-10 max-w-3xl px-4 pb-12 print:mt-0">
        <div className="mb-3 flex justify-end">
          <BotonImprimir />
        </div>
        <InformePublico informe={informe} />
        <p className="mt-6 text-center text-xs text-gris">Se actualiza a medida que se inscriben. Datos sin nombres ni datos personales.</p>
      </main>
    </div>
  );
}
