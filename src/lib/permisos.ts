import { env } from "./env";
import type { Actividad, Asignacion, Rol, Usuario } from "./schema";
import { ambitoDe } from "./territorio";

/**
 * Quién puede hacer qué. Todas las pantallas y acciones consultan estas funciones;
 * el navegador nunca decide permisos.
 */

export interface Yo {
  email: string;
  nombre: string;
  rol: Rol;
  zona: string; // zona de Capital o región del interior
  usuarioId: string; // "" si es administrador inicial (ADMIN_EMAILS) todavía no cargado en USUARIOS
  /** «Ver la app como…»: un administrador mirando la app con el rol de otra persona (solo lectura). */
  vistaPrevia?: { etiqueta: string };
}

/** Cookie de «Ver la app como…» (solo cuenta si quien la tiene es administrador). */
export const VER_COMO_COOKIE = "gt47_ver_como";

/**
 * «Ver la app como…»: el administrador elige a un usuario («u:USR-0003») o un rol genérico («r:LOGISTICA:» / «r:RESPONSABLE:ESTE»)
 * y la app se arma exactamente con esos permisos. Si quien lo pide no es administrador, se ignora.
 */
export function aplicarVerComo(real: Yo, valor: string | undefined, usuarios: Usuario[]): Yo {
  if (!valor || real.rol !== "ADMINISTRADOR") return real;
  if (valor.startsWith("u:")) {
    const u = usuarios.find((x) => x.id === valor.slice(2) && x.estado === "ACTIVO");
    if (!u || u.rol === "ADMINISTRADOR") return real;
    const nombre = `${u.nombre} ${u.apellido}`.trim();
    return { email: real.email, nombre, rol: u.rol, zona: u.zona, usuarioId: u.id, vistaPrevia: { etiqueta: `${nombre} · ${ROL_LABEL[u.rol]}` } };
  }
  const [tipo, rol = "", zona = ""] = valor.split(":");
  if (tipo !== "r" || !(rol in ROL_LABEL) || rol === "ADMINISTRADOR") return real;
  const r = rol as Rol;
  return { email: real.email, nombre: ROL_LABEL[r], rol: r, zona, usuarioId: "", vistaPrevia: { etiqueta: `${ROL_LABEL[r]}${zona ? ` · ${zona}` : ""} (genérico)` } };
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
/** Comunicación / Diseño: ve todas las actividades (sin datos personales ni costos) y gestiona los flyers. */
export const esDiseno = (yo: Yo) => yo.rol === "DISENO";
/** Agenda de referentes: ve todas las actividades y sus números (sin datos de personas ni costos). Solo lectura. */
export const esAgenda = (yo: Yo) => yo.rol === "AGENDA";
/** Responsable de ferias: crea y organiza todas las ferias (feriantes, puestos, croquis, asistencia). No ve el resto. */
export const esFerias = (yo: Yo) => yo.rol === "FERIAS";
/**
 * Logística: ve todas las actividades (calendario, mapa, detalle e inscriptos), colabora con la asistencia
 * y registra entregas y devoluciones de elementos. No crea ni edita actividades ni datos de los responsables.
 */
export const esLogistica = (yo: Yo) => yo.rol === "LOGISTICA";

function asignada(yo: Yo, act: Actividad, asignaciones: Asignacion[]) {
  return asignaciones.some((a) => a.estado === "ACTIVA" && a.actividad_id === act.id && a.usuario_id === yo.usuarioId);
}

/** Responsable: su zona de Capital o su región del interior. */
function deSuZona(yo: Yo, act: Actividad) {
  return !!yo.zona && act.zona === yo.zona;
}

/** Actividades GENERAL (toda la ciudad) o sin zona: las ven los responsables de Capital (no pertenecen a nadie). */
const generalDeCapital = (yo: Yo, act: Actividad) => (act.zona === "GENERAL" || !act.zona) && ambitoDe(yo.zona) === "capital";

/** Responsable de ferias: cualquier feria, de cualquier zona. */
const feriaSuya = (yo: Yo, act: Actividad) => esFerias(yo) && act.es_feria;

export const puede = {
  verActividad: (yo: Yo, act: Actividad, asig: Asignacion[]) =>
    esAdmin(yo) || esDiseno(yo) || esAgenda(yo) || esLogistica(yo) || (esResponsable(yo) && (deSuZona(yo, act) || generalDeCapital(yo, act))) || (esOperador(yo) && asignada(yo, act, asig)) || feriaSuya(yo, act),
  crearActividad: (yo: Yo) => esAdmin(yo) || esResponsable(yo),
  /** Crear ferias (desde el menú Ferias). */
  crearFeria: (yo: Yo) => esAdmin(yo) || esResponsable(yo) || esFerias(yo),
  editarActividad: (yo: Yo, act: Actividad) => esAdmin(yo) || (esResponsable(yo) && deSuZona(yo, act)) || feriaSuya(yo, act),
  tomarAsistencia: (yo: Yo, act: Actividad, asig: Asignacion[]) =>
    esAdmin(yo) || esLogistica(yo) || (esResponsable(yo) && deSuZona(yo, act)) || (esOperador(yo) && asignada(yo, act, asig)) || feriaSuya(yo, act),
  /**
   * Confirmación por WhatsApp, link y mensajes del grupo: lo maneja el equipo de la actividad.
   * Logística colabora con la asistencia pero no toca lo que cargan los responsables.
   */
  contactarInscriptos: (yo: Yo, act: Actividad, asig: Asignacion[]) => !esLogistica(yo) && puede.tomarAsistencia(yo, act, asig),
  /** Registrar preparación, entregas y devoluciones de elementos. */
  gestionarLogistica: (yo: Yo) => esAdmin(yo) || esLogistica(yo),
  cerrarActividad: (yo: Yo, act: Actividad) => esAdmin(yo) || (esResponsable(yo) && deSuZona(yo, act)) || feriaSuya(yo, act),
  importar: (yo: Yo, act: Actividad) => esAdmin(yo) || (esResponsable(yo) && deSuZona(yo, act)) || feriaSuya(yo, act),
  asignarOperadores: (yo: Yo, act: Actividad) => esAdmin(yo) || (esResponsable(yo) && deSuZona(yo, act)),
  /** Listado de inscriptos (nombres y datos de contacto): nunca para Diseño. */
  verInscriptos: (yo: Yo, act: Actividad, asig: Asignacion[]) => !esDiseno(yo) && !esAgenda(yo) && puede.verActividad(yo, act, asig),
  /** Estado, imágenes y link del flyer: solo administración y diseño (el responsable solo lo pide y lo descarga). */
  editarFlyer: (yo: Yo, _act?: Actividad) => esAdmin(yo) || esDiseno(yo),
  /** Menú Ferias (inscriptas, puestos y croquis): administración y responsables (de su zona). */
  verFerias: (yo: Yo) => esAdmin(yo) || esResponsable(yo) || esFerias(yo),
  verFlyers: (yo: Yo) => esAdmin(yo) || esDiseno(yo) || esResponsable(yo),
  verCostos: (yo: Yo) => esAdmin(yo) || esResponsable(yo),
  verParticipantes: (yo: Yo) => esAdmin(yo) || esResponsable(yo),
  verDniCompleto: (yo: Yo) => esAdmin(yo),
  verTelefono: (yo: Yo) => esAdmin(yo) || esResponsable(yo) || esFerias(yo),
  verEstadisticas: (yo: Yo) => esAdmin(yo) || esResponsable(yo),
  configurar: (yo: Yo) => esAdmin(yo),
};

/** Actividades visibles para el usuario. */
export function actividadesVisibles(yo: Yo, acts: Actividad[], asig: Asignacion[]): Actividad[] {
  if (esAdmin(yo) || esDiseno(yo) || esAgenda(yo) || esLogistica(yo)) return acts;
  return acts.filter((a) => puede.verActividad(yo, a, asig));
}

/** Para estadísticas: el responsable ve solo su zona. */
export function zonaForzada(yo: Yo): string {
  return esResponsable(yo) ? yo.zona : "";
}

export const ROL_LABEL: Record<Rol, string> = {
  ADMINISTRADOR: "Administrador/a",
  RESPONSABLE: "Responsable de zona",
  OPERADOR: "Operador/a de actividad",
  DISENO: "Comunicación / Diseño",
  AGENDA: "Agenda (solo lectura)",
  FERIAS: "Responsable de ferias",
  LOGISTICA: "Logística",
};
