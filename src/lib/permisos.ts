import { env } from "./env";
import type { Actividad, Asignacion, Rol, Usuario, Zona } from "./schema";

/**
 * Quién puede hacer qué. Todas las pantallas y acciones consultan estas funciones;
 * el navegador nunca decide permisos.
 */

export interface Yo {
  email: string;
  nombre: string;
  rol: Rol;
  zona: Zona | "";
  usuarioId: string; // "" si es administrador inicial (ADMIN_EMAILS) todavía no cargado en USUARIOS
}

/** Resuelve el usuario a partir de la hoja USUARIOS (+ administradores iniciales de ADMIN_EMAILS). */
export function resolverUsuario(email: string, nombreGoogle: string, usuarios: Usuario[]): Yo | null {
  const e = email.trim().toLowerCase();
  const u = usuarios.find((x) => x.email.trim().toLowerCase() === e);
  if (env.adminEmails().includes(e)) {
    return {
      email: e,
      nombre: u ? `${u.nombre} ${u.apellido}`.trim() : nombreGoogle,
      rol: "ADMINISTRADOR",
      zona: u?.zona ?? "",
      usuarioId: u?.id ?? "",
    };
  }
  if (!u || u.estado !== "ACTIVO") return null;
  return { email: e, nombre: `${u.nombre} ${u.apellido}`.trim() || nombreGoogle, rol: u.rol, zona: u.zona, usuarioId: u.id };
}

export const esAdmin = (yo: Yo) => yo.rol === "ADMINISTRADOR";
export const esResponsable = (yo: Yo) => yo.rol === "RESPONSABLE";
export const esOperador = (yo: Yo) => yo.rol === "OPERADOR";

function asignada(yo: Yo, act: Actividad, asignaciones: Asignacion[]) {
  return asignaciones.some((a) => a.estado === "ACTIVA" && a.actividad_id === act.id && a.usuario_id === yo.usuarioId);
}

/** Responsable: su zona. Si la actividad es GENERAL o no tiene zona, también la ven (no pertenece a nadie). */
function deSuZona(yo: Yo, act: Actividad) {
  return !!yo.zona && act.zona === yo.zona;
}

export const puede = {
  verActividad: (yo: Yo, act: Actividad, asig: Asignacion[]) =>
    esAdmin(yo) || (esResponsable(yo) && (deSuZona(yo, act) || act.zona === "GENERAL" || !act.zona)) || (esOperador(yo) && asignada(yo, act, asig)),
  crearActividad: (yo: Yo) => esAdmin(yo) || esResponsable(yo),
  editarActividad: (yo: Yo, act: Actividad) => esAdmin(yo) || (esResponsable(yo) && deSuZona(yo, act)),
  tomarAsistencia: (yo: Yo, act: Actividad, asig: Asignacion[]) =>
    esAdmin(yo) || (esResponsable(yo) && deSuZona(yo, act)) || (esOperador(yo) && asignada(yo, act, asig)),
  cerrarActividad: (yo: Yo, act: Actividad) => esAdmin(yo) || (esResponsable(yo) && deSuZona(yo, act)),
  importar: (yo: Yo, act: Actividad) => esAdmin(yo) || (esResponsable(yo) && deSuZona(yo, act)),
  asignarOperadores: (yo: Yo, act: Actividad) => esAdmin(yo) || (esResponsable(yo) && deSuZona(yo, act)),
  verCostos: (yo: Yo) => esAdmin(yo) || esResponsable(yo),
  verParticipantes: (yo: Yo) => esAdmin(yo) || esResponsable(yo),
  verDniCompleto: (yo: Yo) => esAdmin(yo),
  verTelefono: (yo: Yo) => esAdmin(yo) || esResponsable(yo),
  verEstadisticas: (yo: Yo) => esAdmin(yo) || esResponsable(yo),
  configurar: (yo: Yo) => esAdmin(yo),
};

/** Actividades visibles para el usuario. */
export function actividadesVisibles(yo: Yo, acts: Actividad[], asig: Asignacion[]): Actividad[] {
  if (esAdmin(yo)) return acts;
  return acts.filter((a) => puede.verActividad(yo, a, asig));
}

/** Para estadísticas: el responsable ve solo su zona. */
export function zonaForzada(yo: Yo): Zona | "" {
  return esResponsable(yo) ? yo.zona : "";
}

export const ROL_LABEL: Record<Rol, string> = {
  ADMINISTRADOR: "Administrador/a",
  RESPONSABLE: "Responsable de zona",
  OPERADOR: "Operador/a de actividad",
};
