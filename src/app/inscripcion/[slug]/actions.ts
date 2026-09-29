"use server";

import { checkSpam } from "@/lib/antispam";
import { toActionError, type ActionResult } from "@/lib/errors";
import { inscribirPublico } from "@/lib/services/inscripciones";

export type InscripcionState = ActionResult<{ status: string; nombre: string; motivo?: string }>;

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Server Action PÚBLICA: solo permite ENVIAR una inscripción. Todo se valida en el servidor. */
export async function inscribirAction(slug: string, _: InscripcionState, fd: FormData): Promise<InscripcionState> {
  const spam = await checkSpam(fd, slug);
  if (!spam.ok) {
    return spam.silencioso ? { ok: true, data: { status: "inscripto", nombre: "" } } : { ok: false, message: spam.message };
  }
  try {
    const respuestas = fd.getAll("respuesta").map((r, i) => ({ pregunta: String(i), respuesta: String(r ?? "") }));
    const r = await inscribirPublico(slug, {
      nombre: s(fd, "nombre"),
      apellido: s(fd, "apellido"),
      dni: s(fd, "dni"),
      telefono: s(fd, "telefono"),
      barrio: s(fd, "barrio") === "__otro" ? s(fd, "barrio_otro") : s(fd, "barrio"),
      respuestas,
      consentimiento: fd.get("consentimiento") === "on",
    });
    if (r.status === "cerrada") return { ok: false, message: r.motivo, data: { status: r.status, nombre: "", motivo: r.motivo } };
    return { ok: true, data: { status: r.status, nombre: r.nombre } };
  } catch (e) {
    return toActionError(e);
  }
}
