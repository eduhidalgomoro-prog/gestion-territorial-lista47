"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AYUDANTE_COOKIE, createAyudanteToken } from "@/lib/auth/session";
import { toActionError, type ActionResult } from "@/lib/errors";
import { ingresarAyudante } from "@/lib/services/ayudantes";

/** La persona escribió su nombre en la pantalla del QR: queda conectada como ayudante de esa actividad. */
export async function entrarAyudanteAction(token: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  let destino: string;
  try {
    const r = await ingresarAyudante(token, String(fd.get("nombre") ?? ""));
    const vence = new Date(r.inv.vence);
    const jwt = await createAyudanteToken({ invitacionId: r.inv.id, actividadId: r.a.id, nombre: r.nombre }, vence);
    (await cookies()).set(AYUDANTE_COOKIE, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: vence,
    });
    destino = `/actividades/${r.a.id}`;
  } catch (e) {
    return toActionError(e);
  }
  redirect(destino);
}

export async function salirAyudanteAction() {
  (await cookies()).delete(AYUDANTE_COOKIE);
  redirect("/ayudante/fin?motivo=salio");
}
