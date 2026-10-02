import Link from "next/link";
import { IconArrowLeft, IconHuella } from "@/components/icons";
import { RegistrarAtencion } from "@/components/registrar-atencion";
import { Notice } from "@/components/ui";
import { cargarOperativo } from "../comun";

export const metadata = { title: "Registrar atención" };

export default async function NuevaAtencion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { a, registrar, atenciones } = await cargarOperativo(id);
  if (!registrar) return <Notice tone="alerta">Solo pueden registrar atenciones quienes tienen asignado este operativo.</Notice>;
  return (
    <div className="tema-huellas mx-auto max-w-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href={`/actividades/${a.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-petroleo">
          <IconArrowLeft size={16} /> Operativo
        </Link>
        <span className="text-sm font-semibold text-gris">{atenciones.length} {atenciones.length === 1 ? "atención registrada" : "atenciones registradas"}</span>
      </div>
      <p className="flex items-center gap-2 text-sm font-extrabold tracking-[0.14em] text-marca uppercase"><IconHuella size={18} /> Marcando Huellas</p>
      <h1 className="mb-4 font-titulo text-2xl font-extrabold text-petroleo-600">Registrar atención</h1>
      <RegistrarAtencion actividadId={a.id} />
    </div>
  );
}
