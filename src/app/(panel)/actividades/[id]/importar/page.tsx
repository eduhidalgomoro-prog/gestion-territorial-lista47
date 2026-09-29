import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { Importador } from "./importador";

export const metadata = { title: "Importar inscriptos" };

export default async function Importar({ params }: { params: Promise<{ id: string }> }) {
  const yo = await requireUser();
  const { id } = await params;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verActividad(yo, a, s.asignaciones)) notFound();
  if (!puede.importar(yo, a)) return <Notice tone="alerta">Solo la administración o el responsable de la zona pueden importar inscriptos.</Notice>;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: `/actividades/${id}`, label: a.nombre }} kicker="Importar inscriptos de Google Forms" title={a.nombre} />
      <Importador actividadId={id} />
    </div>
  );
}
