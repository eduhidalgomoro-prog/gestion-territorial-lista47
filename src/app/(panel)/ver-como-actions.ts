"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { usuarioReal } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { aplicarVerComo, VER_COMO_COOKIE } from "@/lib/permisos";

/**
 * «Ver la app como…»: solo un administrador (de verdad, no en vista previa) puede activarlo.
 * La cookie dura unas horas y solo cambia lo que se MUESTRA; mientras está activa no se guarda nada.
 */
export async function verComoAction(valor: string) {
  const real = await usuarioReal();
  if (!real || real.rol !== "ADMINISTRADOR") redirect("/inicio");
  const { usuarios } = await snapshot();
  if (!aplicarVerComo(real, valor, usuarios).vistaPrevia) redirect("/configuracion?tab=ver-como");
  (await cookies()).set(VER_COMO_COOKIE, valor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 60 * 60 });
  redirect("/inicio");
}

export async function salirVerComoAction() {
  (await cookies()).delete(VER_COMO_COOKIE);
  redirect("/configuracion?tab=ver-como");
}
