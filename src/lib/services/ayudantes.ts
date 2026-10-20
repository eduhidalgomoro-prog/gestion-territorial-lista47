import "server-only";
import { randomBytes } from "node:crypto";
import { insert, readFresh, snapshot, update, NotFoundError } from "../db";
import { env } from "../env";
import { ForbiddenError, UserError } from "../errors";
import { withLock } from "../lock";
import { puede, type Yo } from "../permisos";
import type { Actividad, Ayudante } from "../schema";
import { cleanString, nowIso, titleCase, today } from "../util";

/**
 * Acceso de ayudante: el responsable genera un QR/link para que alguien del lugar ayude a cargar
 * en UNA actividad (asistencia o atenciones), sin usuario ni cuenta de Google.
 * - Vence solo al terminar el día de la actividad (o de hoy, si ya pasó) y se puede cortar antes.
 * - Cada persona que entra escribe su nombre: lo que carga queda firmado «Nombre (ayudante de …)».
 */

/** Fin del día (23:59:59, hora de Corrientes) de la fecha de la actividad, o de hoy si ya pasó. */
export function venceAcceso(a: Pick<Actividad, "fecha">, hoy = today()): string {
  const dia = a.fecha && a.fecha > hoy ? a.fecha : hoy;
  return `${dia}T23:59:59-03:00`;
}

export const vigente = (x: Pick<Ayudante, "activo" | "vence">, ahora = Date.now()) => x.activo && Date.parse(x.vence) > ahora;

export const linkAyudante = (token: string) => `${env.appUrl()}/ayudante/${token}`;

async function actividadPara(actividadId: string, yo: Yo) {
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === actividadId);
  if (!a) throw new NotFoundError("La actividad");
  if (!puede.sumarAyudantes(yo, a)) throw new ForbiddenError("Solo quien organiza la actividad puede sumar ayudantes.");
  if (a.estado === "CANCELADA") throw new UserError("La actividad está cancelada.");
  return a;
}

export async function crearAccesoAyudante(actividadId: string, yo: Yo): Promise<Ayudante> {
  const a = await actividadPara(actividadId, yo);
  return insert(
    "ayudantes",
    {
      actividad_id: a.id,
      token: randomBytes(18).toString("base64url"),
      creado_por: yo.email,
      creado_por_nombre: yo.nombre,
      vence: venceAcceso(a),
      activo: true,
      ingresaron: "",
    },
    yo.email,
  );
}

export async function cortarAccesoAyudante(id: string, yo: Yo) {
  const s = await snapshot();
  const inv = (s.ayudantes ?? []).find((x) => x.id === id);
  if (!inv) throw new NotFoundError("El acceso");
  await actividadPara(inv.actividad_id, yo);
  if (inv.activo) await update("ayudantes", id, { activo: false }, yo.email, { accion: "cortar acceso de ayudantes" });
}

export type AccesoAyudante = { ok: true; inv: Ayudante; a: Actividad } | { ok: false; motivo: "no_existe" | "vencido" };

/** Para la pantalla de entrada: ¿el QR sigue sirviendo? */
export async function buscarAcceso(token: string): Promise<AccesoAyudante> {
  const t = cleanString(token, 60);
  const s = await snapshot();
  const inv = t ? (s.ayudantes ?? []).find((x) => x.token === t) : undefined;
  const a = inv && s.actividades.find((x) => x.id === inv.actividad_id);
  if (!inv || !a) return { ok: false, motivo: "no_existe" };
  if (!vigente(inv) || a.estado === "CANCELADA") return { ok: false, motivo: "vencido" };
  return { ok: true, inv, a };
}

/** La persona escribió su nombre: queda registrada en el acceso (para saber quiénes ayudaron). */
export async function ingresarAyudante(token: string, nombreCrudo: string) {
  const nombre = titleCase(cleanString(nombreCrudo, 60)).replace(/\s+/g, " ").trim();
  if ((nombre.match(/\p{L}/gu) ?? []).length < 3) throw new UserError("Escribí tu nombre y apellido.", { nombre: "Escribí tu nombre y apellido." });
  const r = await buscarAcceso(token);
  if (!r.ok) throw new UserError("Este acceso ya no está vigente. Pedile a la persona responsable un QR nuevo.");
  await withLock(`ayudantes:${r.inv.id}`, async () => {
    const actual = (await readFresh("ayudantes")).find((x) => x.id === r.inv.id);
    if (!actual) return;
    const lista = actual.ingresaron ? actual.ingresaron.split(",").map((x) => x.trim()) : [];
    if (!lista.includes(nombre)) await update("ayudantes", actual.id, { ingresaron: [...lista, nombre].join(", ") }, `${nombre} (ayudante)`, { accion: `ingresó como ayudante · ${nowIso()}` });
  });
  return { inv: r.inv, a: r.a, nombre };
}
