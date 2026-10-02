import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { esMarcandoHuellas } from "@/lib/huellas";
import { puede } from "@/lib/permisos";

/** Operativo de Marcando Huellas + permisos (ver atenciones: quien ve inscriptos o toma asistencia). */
export async function cargarOperativo(id: string) {
  const yo = await requireUser();
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !esMarcandoHuellas(a) || !puede.verActividad(yo, a, s.asignaciones)) notFound();
  const registrar = puede.tomarAsistencia(yo, a, s.asignaciones);
  const ver = registrar || puede.verInscriptos(yo, a, s.asignaciones);
  const atenciones = s.atenciones.filter((x) => x.actividad_id === a.id && x.activo);
  return { yo, s, a, registrar, ver, atenciones };
}
