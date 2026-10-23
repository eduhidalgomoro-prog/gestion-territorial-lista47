import { notFound } from "next/navigation";
import { BotonImprimir } from "@/components/boton-imprimir";
import { CopyButton } from "@/components/copy-button";
import { InformePublico } from "@/components/informe-publico";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { armarInforme } from "@/lib/informe";
import { linkInforme } from "@/lib/informe-link";
import { puede } from "@/lib/permisos";
import { formatDate } from "@/lib/util";

export const metadata = { title: "Informe del público" };

/** Informe del público de una actividad (respuestas del formulario, edades, de dónde vienen) y link para el disertante. */
export default async function InformeActividad({ params }: { params: Promise<{ id: string }> }) {
  const yo = await requireUser();
  const { id } = await params;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verInscriptos(yo, a, s.asignaciones)) notFound();
  const informe = armarInforme(a, s.inscripciones, s.participantes);
  const link = linkInforme(a.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: `/actividades/${id}`, label: a.nombre }}
        title="Informe del público"
        subtitle={`${a.nombre}${a.fecha ? ` · ${formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" })}` : ""}`}
        actions={<BotonImprimir />}
      />
      <section className="mb-4 rounded-2xl border border-linea bg-white p-4 print:hidden">
        <h2 className="font-bold">Para el disertante</h2>
        <p className="mb-3 text-sm text-gris">
          Mandale este link: ve este mismo informe sin usuario ni contraseña, y se actualiza solo a medida que se inscriben. Muestra solo cantidades y respuestas, sin nombres, teléfonos ni DNI.
        </p>
        <CopyButton text={link} label="Copiar link del informe" />
      </section>
      <InformePublico informe={informe} />
    </div>
  );
}
