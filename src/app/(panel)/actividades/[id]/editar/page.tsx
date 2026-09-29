import { notFound } from "next/navigation";
import { ActividadWizard } from "@/components/actividad-wizard";
import { Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { sp, type SP } from "@/lib/view";
import { guardarActividadAction } from "../../../actions";
import { inputDesde, opcionesWizard } from "../../form-data";

export const metadata = { title: "Editar actividad" };

export default async function EditarActividad({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const yo = await requireUser();
  const { id } = await params;
  const q = await searchParams;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verActividad(yo, a, s.asignaciones)) notFound();
  if (!puede.editarActividad(yo, a)) {
    return <Notice tone="alerta">Solo podés modificar actividades de tu zona.</Notice>;
  }
  const paso = Math.max(0, (Number(sp(q, "paso")) || 1) - 1);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Editar actividad" subtitle={a.nombre} back={{ href: `/actividades/${a.id}`, label: "Volver a la ficha" }} />
      <ActividadWizard
        key={`${a.id}-${a.version}`}
        inicial={inputDesde(a, s)}
        opciones={opcionesWizard(s, yo, a)}
        action={guardarActividadAction.bind(null, a.id, a.version)}
        pasoInicial={paso}
        esEdicion
      />
    </div>
  );
}
