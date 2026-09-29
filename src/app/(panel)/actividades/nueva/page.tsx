import { ActividadWizard } from "@/components/actividad-wizard";
import { Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { guardarActividadAction } from "../../actions";
import { inputVacio, opcionesWizard } from "../form-data";

export const metadata = { title: "Nueva actividad" };

export default async function NuevaActividad() {
  const yo = await requireUser();
  if (!puede.crearActividad(yo)) {
    return <Notice tone="alerta">Tu rol no permite crear actividades. Consultá con el responsable de tu zona.</Notice>;
  }
  const s = await snapshot();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nueva actividad" back={{ href: "/actividades", label: "Actividades" }} />
      <ActividadWizard inicial={inputVacio(yo)} opciones={opcionesWizard(s, yo)} action={guardarActividadAction.bind(null, null, 0)} esEdicion={false} />
    </div>
  );
}
