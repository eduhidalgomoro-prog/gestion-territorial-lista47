import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@/components/icons";
import { Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { esMarcandoHuellas } from "@/lib/huellas";
import { BIENVENIDA_POR_DEFECTO, esTallerEscuela, IDS_PREGUNTAS_FIJAS, preguntasFijas } from "@/lib/inscripcion-publica";
import { puede } from "@/lib/permisos";
import { preguntasEditables } from "@/lib/services/actividades";
import { nombreCorto } from "@/lib/taller-nombre";
import { EditorFormulario } from "./editor";

export const metadata = { title: "Editar formulario" };

/** Editar el formulario de inscripción de una actividad (los datos personales se piden siempre). */
export default async function EditarFormulario({ params }: { params: Promise<{ id: string }> }) {
  const yo = await requireUser();
  const { id } = await params;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verActividad(yo, a, s.asignaciones)) notFound();
  if (!puede.editarActividad(yo, a)) return <Notice tone="alerta">Solo quien organiza la actividad puede cambiar el formulario.</Notice>;
  if (a.es_feria || esMarcandoHuellas(a)) return <Notice>Esta actividad tiene su propio formulario (feria o Marcando Huellas): no se edita desde acá.</Notice>;

  const fijas = preguntasFijas(a);
  return (
    <div className="mx-auto max-w-2xl pb-6">
      <Link href={`/actividades/${id}?abrir=inscripcion#inscripcion`} className="-ml-1 mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-[15px] font-semibold text-petroleo hover:underline">
        <IconArrowLeft size={18} /> Ficha de la actividad
      </Link>
      <header className="mb-4">
        <p className="text-[12px] font-extrabold tracking-[0.16em] text-marca uppercase">Formulario de inscripción</p>
        <h1 className="font-titulo text-[23px] leading-tight font-extrabold text-petroleo-600" title={a.nombre}>{nombreCorto(a.nombre)}</h1>
        <p className="mt-1 text-[15px] text-gris">Elegí qué preguntas hace este formulario. Los datos de la persona se piden siempre.</p>
      </header>
      <EditorFormulario
        actividadId={id}
        slug={a.slug}
        escuela={esTallerEscuela(a)}
        inicial={{
          sin: IDS_PREGUNTAS_FIJAS.filter((x) => !fijas[x]),
          preguntas: preguntasEditables(a.preguntas_extra),
          bienvenida: a.bienvenida,
          cupo: a.cupo || null,
        }}
        bienvenidaPorDefecto={BIENVENIDA_POR_DEFECTO}
      />
    </div>
  );
}
