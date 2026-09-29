"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { toActionError, UserError, type ActionResult } from "@/lib/errors";
import { puede } from "@/lib/permisos";
import {
  actualizarFlyer, asignarOperador, cambiarEstado, cerrarActividad, crearActividad, editarActividad, formularioInscripcion, quitarOperador,
  type ActividadInput,
} from "@/lib/services/actividades";
import { crearUsuario, editarUsuario, guardarBarrio, guardarConfig, guardarInstitucion } from "@/lib/services/administracion";
import { agregarPresente, buscarPorDni, guardarAsistencia, type Marca } from "@/lib/services/asistencia";
import { geocodificar, type Ubicacion } from "@/lib/services/geocode";
import { confirmarImportacion, darDeBaja, vistaPreviaImportacion, type FilaImportada, type VistaPrevia } from "@/lib/services/inscripciones";
import type { Yo } from "@/lib/permisos";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const num = (fd: FormData, k: string) => Number(str(fd, k).replace(/\./g, "").replace(",", ".")) || 0;

function refrescar() {
  revalidatePath("/", "layout");
}

/** Envoltorio común: verifica sesión, convierte errores en mensajes claros y refresca las pantallas. */
async function act<T>(fn: (yo: Yo) => Promise<T>, opts: { redirectTo?: (r: T) => string; ok?: string } = {}): Promise<ActionResult<T>> {
  const yo = await requireUser();
  let r: T;
  try {
    r = await fn(yo);
  } catch (e) {
    return toActionError(e);
  }
  refrescar();
  if (opts.redirectTo) redirect(opts.redirectTo(r));
  return { ok: true, message: opts.ok ?? "Listo, quedó guardado.", data: r };
}

// ---------------------------------------------------------------------------
// Actividades
// ---------------------------------------------------------------------------

export async function guardarActividadAction(id: string | null, version: number, _: ActionResult, fd: FormData): Promise<ActionResult> {
  let input: ActividadInput;
  try {
    input = JSON.parse(str(fd, "payload")) as ActividadInput;
  } catch {
    return { ok: false, message: "No pudimos leer el formulario. Recargá la página." };
  }
  return act(
    (yo) => (id ? editarActividad(id, input, yo, version) : crearActividad(input, yo)),
    { redirectTo: (a) => `/actividades/${a.id}?ok=${id ? "editada" : "creada"}` },
  );
}

export async function cambiarEstadoAction(id: string, estado: string): Promise<ActionResult> {
  return act((yo) => cambiarEstado(id, estado, yo), { ok: `Estado cambiado a ${estado}.` });
}

export async function flyerAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act((yo) => actualizarFlyer(id, str(fd, "estado_flyer"), str(fd, "link_flyer"), yo), { ok: "Flyer actualizado." });
}

export async function formularioAction(id: string, abrir: boolean): Promise<ActionResult> {
  return act((yo) => formularioInscripcion(id, abrir, yo), { ok: abrir ? "Formulario de inscripción abierto." : "Inscripción cerrada." });
}

export async function cerrarAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(
    (yo) =>
      cerrarActividad(id, { costo_real: num(fd, "costo_real"), observaciones: str(fd, "observaciones"), resultados: str(fd, "resultados"), incidencias: str(fd, "incidencias"), fotos: str(fd, "fotos") }, yo),
    { redirectTo: () => `/actividades/${id}?ok=cerrada` },
  );
}

export async function asignarOperadorAction(actividadId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act((yo) => asignarOperador(actividadId, str(fd, "usuario_id"), yo), { ok: "Operador asignado." });
}

export async function quitarOperadorAction(asignacionId: string): Promise<ActionResult> {
  return act((yo) => quitarOperador(asignacionId, yo), { ok: "Asignación quitada." });
}

export async function bajaInscripcionAction(inscripcionId: string): Promise<ActionResult> {
  return act((yo) => darDeBaja(inscripcionId, yo), { ok: "Inscripción dada de baja." });
}

export async function geocodeAction(direccion: string, barrio: string): Promise<Ubicacion | null> {
  await requireUser();
  return geocodificar(String(direccion ?? "").slice(0, 200), String(barrio ?? "").slice(0, 80));
}

// ---------------------------------------------------------------------------
// Importación de Google Forms
// ---------------------------------------------------------------------------

export async function vistaPreviaAction(actividadId: string, filas: FilaImportada[]): Promise<ActionResult<VistaPrevia>> {
  const yo = await requireUser();
  try {
    return { ok: true, data: await vistaPreviaImportacion(actividadId, filas, yo) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function importarAction(actividadId: string, filas: FilaImportada[]) {
  return act((yo) => confirmarImportacion(actividadId, filas, yo), { ok: "Importación terminada." });
}

// ---------------------------------------------------------------------------
// Asistencia
// ---------------------------------------------------------------------------

export async function guardarMarcasAction(actividadId: string, marcas: Marca[]): Promise<ActionResult<{ guardadas: number }>> {
  const yo = await requireUser();
  try {
    const r = await guardarAsistencia(actividadId, marcas, yo);
    return { ok: true, data: r };
  } catch (e) {
    return toActionError(e);
  }
}

export async function buscarDniAction(actividadId: string, dni: string) {
  const yo = await requireUser();
  try {
    return { ok: true, data: await buscarPorDni(actividadId, dni, yo) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function agregarPresenteAction(actividadId: string, _: ActionResult, fd: FormData) {
  return act(
    (yo) =>
      agregarPresente(actividadId, { nombre: str(fd, "nombre"), apellido: str(fd, "apellido"), dni: str(fd, "dni"), telefono: str(fd, "telefono"), barrio: str(fd, "barrio") }, yo),
    { ok: "Persona agregada y marcada como presente." },
  );
}

// ---------------------------------------------------------------------------
// Configuración (solo administración)
// ---------------------------------------------------------------------------

function soloAdmin(yo: Yo) {
  if (!puede.configurar(yo)) throw new UserError("Solo la administración puede cambiar la configuración.");
}

export async function usuarioAction(id: string | null, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(
    async (yo) => {
      soloAdmin(yo);
      const input = { nombre: str(fd, "nombre"), apellido: str(fd, "apellido"), email: str(fd, "email"), rol: str(fd, "rol"), zona: str(fd, "zona"), activo: str(fd, "estado") !== "INACTIVO" };
      return id ? editarUsuario(id, input, yo.email) : crearUsuario(input, yo.email);
    },
    { ok: id ? "Usuario actualizado." : "Usuario creado. Ya puede ingresar con su cuenta de Google." },
  );
}

export async function barrioAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(async (yo) => {
    soloAdmin(yo);
    await guardarBarrio(str(fd, "barrio"), str(fd, "zona"), str(fd, "activo") !== "NO", yo.email);
  }, { ok: "Barrio guardado." });
}

export async function institucionAction(id: string | null, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(async (yo) => {
    soloAdmin(yo);
    await guardarInstitucion({ id: id ?? undefined, nombre: str(fd, "nombre"), tipo: str(fd, "tipo"), observaciones: str(fd, "observaciones") }, yo.email);
  }, { ok: "Institución guardada." });
}

export async function configAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(async (yo) => {
    soloAdmin(yo);
    const values: Record<string, string> = {};
    for (const [k, v] of fd) if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
    await guardarConfig(values, yo.email);
  }, { ok: "Configuración guardada." });
}
