"use server";

import { checkSpam } from "@/lib/antispam";
import { toActionError, type ActionResult } from "@/lib/errors";
import { OTRO, siNo } from "@/lib/inscripcion-publica";
import { inscribirPublico } from "@/lib/services/inscripciones";
import { inscribirFeriaPublico } from "@/lib/services/ferias";

export type InscripcionState = ActionResult<{ status: string; nombre: string; motivo?: string }>;

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Server Action PÚBLICA: solo permite ENVIAR una inscripción. Todo se valida en el servidor. */
export async function inscribirAction(slug: string, _: InscripcionState, fd: FormData): Promise<InscripcionState> {
  const spam = await checkSpam(fd, slug);
  if (!spam.ok) {
    return spam.silencioso ? { ok: true, data: { status: "inscripto", nombre: "" } } : { ok: false, message: spam.message };
  }
  try {
    // Cada pregunta viene como respuesta-0, respuesta-1… (así las opciones sin elegir no corren el orden).
    const respuestas = Array.from({ length: 30 }, (_, i) => ({ pregunta: String(i), respuesta: s(fd, `respuesta-${i}`) }));
    const r = await inscribirPublico(slug, {
      nombre: s(fd, "nombre"),
      apellido: s(fd, "apellido"),
      dni: s(fd, "dni"),
      telefono: s(fd, "telefono"),
      ciudad: s(fd, "ciudad") === OTRO ? s(fd, "ciudad_otra") : s(fd, "ciudad"),
      barrio: s(fd, "barrio") === OTRO ? s(fd, "barrio_otro") : s(fd, "barrio"),
      direccion: s(fd, "direccion"),
      fecha_nacimiento: s(fd, "fecha_nacimiento"),
      respuestas,
      escuela: {
        ex_alumna: siNo(s(fd, "ex_alumna")),
        quiere_ser_profe: siNo(s(fd, "quiere_ser_profe")),
        ensenaria: s(fd, "ensenaria"),
        conoce_espacio: siNo(s(fd, "conoce_espacio")),
        espacio: s(fd, "espacio"),
      },
      consentimiento: fd.get("consentimiento") === "on",
    });
    if (r.status === "cerrada") return { ok: false, message: r.motivo, data: { status: r.status, nombre: "", motivo: r.motivo } };
    return { ok: true, data: { status: r.status, nombre: r.nombre } };
  } catch (e) {
    return toActionError(e);
  }
}

export type FeriaState = ActionResult<{ status: string; nombre: string; motivo?: string }>;

/** Server Action PÚBLICA de inscripción a una feria (respeta el cupo). */
export async function inscribirFeriaAction(slug: string, _: FeriaState, fd: FormData): Promise<FeriaState> {
  const spam = await checkSpam(fd, slug);
  if (!spam.ok) {
    return spam.silencioso ? { ok: true, data: { status: "inscripta", nombre: "" } } : { ok: false, message: spam.message };
  }
  try {
    const r = await inscribirFeriaPublico(slug, {
      nombre: s(fd, "nombre"),
      apellido: s(fd, "apellido"),
      dni: s(fd, "dni"),
      telefono: s(fd, "telefono"),
      barrio: "",
      emprendimiento: s(fd, "emprendimiento"),
      rubro: s(fd, "rubro"),
      lleva: fd.getAll("lleva").map(String),
      al_lado_de: s(fd, "al_lado_de"),
      comparte: s(fd, "comparte"),
      consentimiento: fd.get("consentimiento") === "on",
    });
    if ("motivo" in r) return { ok: false, data: { status: r.status, nombre: "", motivo: r.motivo } };
    return { ok: true, data: { status: r.status, nombre: r.nombre } };
  } catch (e) {
    return toActionError(e);
  }
}
