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
import { anularLote, marcarPreparando, registrarMovimiento, type MovimientoInput } from "@/lib/services/logistica";
import {
  agregarFeriante, asignarAutomatico, asignarPuesto, cambiarEstadoFeriante, configurarFeria, crearFeria, generarPuestos, quitarAsignaciones, ubicarPuestos,
} from "@/lib/services/ferias";
import { confirmarImportacion, darDeBaja, guardarLinkGrupo, guardarMensajes, marcarConfirmacion, vistaPreviaImportacion, type FilaImportada, type VistaPrevia } from "@/lib/services/inscripciones";
import type { Yo } from "@/lib/permisos";
import type { SectorFeria } from "@/lib/ferias";
import { anularAtencion, buscarResponsable, editarAtencion, registrarAtencion, type AtencionInput } from "@/lib/services/huellas";

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

export async function confirmacionAction(inscripcionId: string, valor: string): Promise<ActionResult> {
  return act((yo) => marcarConfirmacion(inscripcionId, valor, yo), { ok: "Anotado." });
}

export async function linkGrupoAction(actividadId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act((yo) => guardarLinkGrupo(actividadId, str(fd, "link_grupo"), yo), { ok: "Link del grupo guardado." });
}

export async function mensajesAction(actividadId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const restaurar = str(fd, "restaurar") === "1";
  return act(
    (yo) => guardarMensajes(actividadId, restaurar ? "" : str(fd, "mensaje_confirmacion"), restaurar ? "" : str(fd, "mensaje_grupo"), yo),
    { ok: restaurar ? "Se volvió a los mensajes por defecto." : "Mensajes guardados para esta actividad." },
  );
}

// ---------------------------------------------------------------------------
// Marcando Huellas (atenciones)
// ---------------------------------------------------------------------------

export async function registrarAtencionAction(actividadId: string, input: AtencionInput, atencionId?: string): Promise<ActionResult<{ id: string; nombre: string; perros: number; gatos: number }>> {
  return act((yo) => (atencionId ? editarAtencion(atencionId, input, yo) : registrarAtencion(actividadId, input, yo)), { ok: atencionId ? "Atención corregida." : "Atención registrada." });
}

export async function anularAtencionAction(atencionId: string, actividadId: string): Promise<ActionResult> {
  return act((yo) => anularAtencion(atencionId, yo), { redirectTo: () => `/actividades/${actividadId}/atenciones?ok=anulada` });
}

export async function buscarResponsableAction(actividadId: string, dni: string) {
  const yo = await requireUser();
  try {
    return await buscarResponsable(actividadId, String(dni ?? "").slice(0, 20), yo);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ferias
// ---------------------------------------------------------------------------

export async function crearFeriaAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(
    (yo) =>
      crearFeria(
        {
          nombre: str(fd, "nombre"), fecha: str(fd, "fecha"), hora_inicio: str(fd, "hora_inicio"), hora_fin: str(fd, "hora_fin"), lugar: str(fd, "lugar"),
          barrio: str(fd, "barrio").toUpperCase(), zona: str(fd, "zona"), localidad: str(fd, "localidad"),
          cupo: num(fd, "cupo"), sectores: sectoresDeForm(fd),
        },
        yo,
      ),
    { redirectTo: (a) => `/actividades/${a.id}/feria?tab=puestos` },
  );
}

export async function feriaConfigAction(actividadId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act((yo) => configurarFeria(actividadId, num(fd, "cupo"), yo), { ok: "Feria configurada. El formulario de inscripción ya tiene cupo." });
}

/** Sectores de la feria que manda el editor como JSON ([{ tipo, cantidad }]). */
function sectoresDeForm(fd: FormData): SectorFeria[] {
  try {
    const v = JSON.parse(str(fd, "sectores"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function puestosAction(actividadId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act((yo) => generarPuestos(actividadId, sectoresDeForm(fd), yo));
  if (!r.ok || !r.data) return r;
  return { ok: true, message: `Puestos guardados: ${r.data.total}.${r.data.liberadas ? ` ${r.data.liberadas} feriantes quedaron sin puesto porque el suyo ya no existe o cambió: reasignalas.` : ""}` };
}

export async function ubicarPuestosAction(actividadId: string, posiciones: { numero: number; x: number; y: number }[]): Promise<ActionResult<number>> {
  return act((yo) => ubicarPuestos(actividadId, Array.isArray(posiciones) ? posiciones.slice(0, 600) : [], yo), { ok: "Croquis guardado." });
}

export async function asignarPuestoAction(ferianteId: string, numero: number): Promise<ActionResult> {
  return act((yo) => asignarPuesto(ferianteId, numero, yo), { ok: numero ? `Puesto N° ${numero} asignado.` : "Puesto quitado." });
}

export async function asignarAutomaticoAction(actividadId: string): Promise<ActionResult> {
  const r = await act((yo) => asignarAutomatico(actividadId, yo));
  if (!r.ok || !r.data) return r;
  const { asignadas, sinLugar } = r.data;
  return { ok: true, message: `${asignadas} ${asignadas === 1 ? "feriante ubicada" : "feriantes ubicadas"}.${sinLugar ? ` ${sinLugar} sin lugar: revisá los puestos.` : ""}` };
}

export async function quitarAsignacionesAction(actividadId: string): Promise<ActionResult> {
  return act((yo) => quitarAsignaciones(actividadId, yo), { ok: "Se quitaron todas las asignaciones." });
}

export async function estadoFerianteAction(ferianteId: string, activa: boolean): Promise<ActionResult> {
  return act((yo) => cambiarEstadoFeriante(ferianteId, activa, yo), { ok: activa ? "Feriante reincorporada." : "Feriante dada de baja: se liberó su lugar." });
}

export async function agregarFerianteAction(actividadId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act((yo) =>
    agregarFeriante(
      actividadId,
      {
        nombre: str(fd, "nombre"), apellido: str(fd, "apellido"), dni: str(fd, "dni"), telefono: str(fd, "telefono"), barrio: "",
        emprendimiento: str(fd, "emprendimiento"), rubro: str(fd, "rubro"), lleva: fd.getAll("lleva").map(String), al_lado_de: str(fd, "al_lado_de"), comparte: str(fd, "comparte"),
      },
      yo,
    ),
  );
  if (!r.ok || !r.data) return r;
  if (r.data.status === "completo" || r.data.status === "cerrada") return { ok: false, message: "El cupo está completo: subí el cupo o da de baja a alguien." };
  return { ok: true, message: r.data.status === "ya" ? "Ya estaba inscripta: se actualizaron sus datos." : "Feriante agregada." };
}

export async function bajaInscripcionAction(inscripcionId: string): Promise<ActionResult> {
  return act((yo) => darDeBaja(inscripcionId, yo), { ok: "Inscripción dada de baja." });
}

export async function geocodeAction(direccion: string, barrio: string, localidad = ""): Promise<Ubicacion | null> {
  await requireUser();
  return geocodificar(String(direccion ?? "").slice(0, 200), String(barrio ?? "").slice(0, 80), String(localidad ?? "").slice(0, 80));
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
      agregarPresente(actividadId, { nombre: str(fd, "nombre"), apellido: str(fd, "apellido"), dni: str(fd, "dni"), telefono: str(fd, "telefono"), barrio: str(fd, "barrio") }, yo, num(fd, "clase") || 1),
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
      const input = {
        nombre: str(fd, "nombre"), apellido: str(fd, "apellido"), email: str(fd, "email"), telefono: str(fd, "telefono"),
        rol: str(fd, "rol"), zona: str(fd, "zona"), activo: str(fd, "estado") !== "INACTIVO",
      };
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

// ---------------------------------------------------------------------------
// Logística (entregas y devoluciones de elementos)
// ---------------------------------------------------------------------------

export async function movimientoLogisticaAction(actividadId: string, tipo: "ENTREGA" | "DEVOLUCION", input: MovimientoInput): Promise<ActionResult> {
  if (tipo !== "ENTREGA" && tipo !== "DEVOLUCION") return { ok: false, message: "Movimiento inválido." };
  return act((yo) => registrarMovimiento(actividadId, tipo, input, yo), { ok: tipo === "ENTREGA" ? "Entrega registrada." : "Devolución registrada." });
}

export async function preparandoAction(actividadId: string): Promise<ActionResult> {
  return act((yo) => marcarPreparando(actividadId, yo), { ok: "Marcada como «preparando»." });
}

export async function anularLogisticaAction(actividadId: string, lote: string): Promise<ActionResult> {
  return act((yo) => anularLote(actividadId, lote, yo), { ok: "Registro anulado (queda en el historial)." });
}

export async function configAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(async (yo) => {
    soloAdmin(yo);
    const values: Record<string, string> = {};
    for (const [k, v] of fd) if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
    await guardarConfig(values, yo.email);
  }, { ok: "Configuración guardada." });
}
