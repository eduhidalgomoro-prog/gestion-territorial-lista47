/**
 * Estructura de la planilla maestra de Google Sheets.
 * Es la única fuente de verdad sobre hojas, columnas y valores permitidos:
 * la usan la app, el script de configuración (scripts/setup-sheets.ts) y las pruebas.
 *
 * Cada columna tiene una clave interna (la usa el código) y un encabezado legible (el que se ve en Sheets).
 * La app ubica las columnas por el ENCABEZADO: se pueden reordenar o agregar columnas propias sin romper nada.
 */

// ---------------------------------------------------------------------------
// Valores permitidos
// ---------------------------------------------------------------------------

export const ZONAS = ["NORTE", "ESTE", "SUR"] as const;
/** «GENERAL» = actividad de toda la ciudad (no suma al objetivo de ninguna zona). */
export const ZONAS_ACTIVIDAD = [...ZONAS, "GENERAL"] as const;
export const ESTADOS_ACTIVIDAD = ["BORRADOR", "PROGRAMADA", "CONFIRMADA", "REALIZADA", "SUSPENDIDA", "CANCELADA"] as const;
/** Estados que cuentan para el objetivo mensual de cada zona (decisión confirmada con la coordinación). */
export const ESTADOS_QUE_CUENTAN = ["PROGRAMADA", "CONFIRMADA", "REALIZADA"] as const;
export const ESTADOS_FLYER = ["SOLICITADO", "EN DISEÑO", "PARA APROBACIÓN", "APROBADO", "PUBLICADO"] as const;
export const ROLES = ["ADMINISTRADOR", "RESPONSABLE", "OPERADOR", "DISENO"] as const;
export const ESTADOS_USUARIO = ["ACTIVO", "INACTIVO"] as const;
export const ORIGENES_INSCRIPCION = ["FORMULARIO PROPIO", "GOOGLE FORMS", "CARGA MANUAL"] as const;
export const ESTADOS_INSCRIPCION = ["INSCRIPTO", "DADO DE BAJA"] as const;
export const ESTADOS_ASISTENCIA = ["PRESENTE", "AUSENTE"] as const;
export const ESTADOS_REQUERIMIENTO = ["PENDIENTE", "CONSEGUIDO", "ANULADO"] as const;
export const ESTADOS_ASIGNACION = ["ACTIVA", "QUITADA"] as const;

export type Zona = (typeof ZONAS)[number];
export type ZonaActividad = (typeof ZONAS_ACTIVIDAD)[number];
export type EstadoActividad = (typeof ESTADOS_ACTIVIDAD)[number];
export type EstadoFlyer = (typeof ESTADOS_FLYER)[number];
export type Rol = (typeof ROLES)[number];
export type OrigenInscripcion = (typeof ORIGENES_INSCRIPCION)[number];
export type EstadoInscripcion = (typeof ESTADOS_INSCRIPCION)[number];
export type EstadoAsistencia = (typeof ESTADOS_ASISTENCIA)[number];
export type EstadoRequerimiento = (typeof ESTADOS_REQUERIMIENTO)[number];

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

export interface Meta {
  id: string;
  creado: string; // ISO UTC
  actualizado: string; // ISO UTC
  actualizado_por: string;
  version: number;
}

export interface Actividad extends Meta {
  marca_temporal: string;
  mes: number; // se calcula desde la fecha programada
  anio: number;
  nombre: string;
  detalle: string;
  responsable: string;
  zona: ZonaActividad | "";
  tipo: string;
  publico: string;
  estado: EstadoActividad;
  fecha: string; // YYYY-MM-DD
  hora_inicio: string; // HH:MM
  hora_fin: string;
  fecha_alt: string;
  hora_alt: string;
  barrio: string;
  direccion: string;
  entre_calles: string;
  lugar: string;
  lat: number;
  lng: number;
  articula: boolean;
  tipo_articulacion: string;
  mesa: string;
  institucion_id: string;
  institucion_nombre: string;
  requiere_flyer: boolean;
  estado_flyer: EstadoFlyer | "";
  link_flyer: string;
  gazebo: boolean;
  gazebo_cant: number;
  mesas: boolean;
  mesas_cant: number;
  sillas: boolean;
  sillas_cant: number;
  luz: boolean;
  sonido: boolean;
  otros_insumos: string; // resumen legible; el detalle está en REQUERIMIENTOS
  costo_estimado: number;
  costo_real: number;
  obs_logistica: string;
  slug: string;
  link_inscripcion: string;
  inscripcion_abierta: boolean;
  preguntas_extra: string; // una pregunta por línea
  inscriptos: number; // se congelan al cerrar
  presentes: number;
  ausentes: number;
  pct_asistencia: number;
  resultados: string;
  incidencias: string;
  fotos: string; // links (uno por línea)
  observaciones: string;
  origen: string; // APP o ref. de la fila importada del formulario anterior
  creado_por: string;
}

export interface Participante extends Meta {
  nombre: string;
  apellido: string;
  dni: string; // solo dígitos
  telefono: string; // solo dígitos, sin 0 ni 15 cuando se puede
  barrio: string;
  fecha_primera: string; // YYYY-MM-DD
  origen: OrigenInscripcion | "";
  consentimiento: string; // fecha ISO en que aceptó el aviso (formulario público)
  posible_duplicado_de: string;
}

export interface Inscripcion extends Meta {
  actividad_id: string;
  participante_id: string;
  fecha: string; // YYYY-MM-DD
  origen: OrigenInscripcion;
  estado: EstadoInscripcion;
  respuestas: string; // preguntas adicionales: "Pregunta: respuesta" por línea
}

export interface Asistencia extends Meta {
  actividad_id: string;
  participante_id: string;
  estado: EstadoAsistencia;
  registrado: string; // fecha/hora ISO del registro
  usuario: string;
}

export interface Requerimiento extends Meta {
  actividad_id: string;
  tipo: string;
  descripcion: string;
  cantidad: number;
  costo_estimado: number;
  estado: EstadoRequerimiento;
}

export interface Usuario extends Meta {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string; // para enviarle mensajes por WhatsApp (ej. flyers listos)
  rol: Rol;
  zona: Zona | "";
  estado: (typeof ESTADOS_USUARIO)[number];
}

export interface Asignacion extends Meta {
  usuario_id: string;
  actividad_id: string;
  estado: (typeof ESTADOS_ASIGNACION)[number];
}

export interface Institucion extends Meta {
  nombre: string;
  tipo: string;
  observaciones: string;
}

export interface ZonaBarrio {
  zona: Zona;
  barrio: string;
  activo: boolean;
}

export interface ConfigRow {
  clave: string;
  valor: string;
  descripcion: string;
}

export interface AuditoriaRow {
  fecha: string;
  usuario: string;
  accion: string;
  entidad: string;
  ref_id: string;
  detalle: string;
}

export interface EntityMap {
  actividades: Actividad;
  participantes: Participante;
  inscripciones: Inscripcion;
  asistencias: Asistencia;
  requerimientos: Requerimiento;
  usuarios: Usuario;
  asignaciones: Asignacion;
  instituciones: Institucion;
}

export type EntityTable = keyof EntityMap;
export type TableName = EntityTable | "zonas_barrios" | "config" | "auditoria";

type Col = readonly [key: string, header: string];

interface TableDef {
  sheet: string;
  columns: readonly Col[];
  numeric?: readonly string[];
  boolean?: readonly string[];
  enums?: Record<string, readonly string[]>;
  prefix?: string;
}

const META: readonly Col[] = [
  ["creado", "Creado"],
  ["actualizado", "Última modificación"],
  ["actualizado_por", "Modificado por"],
  ["version", "Versión"],
];

export const TABLES: Record<TableName, TableDef> = {
  actividades: {
    sheet: "ACTIVIDADES",
    prefix: "ACT",
    columns: [
      ["id", "ID Actividad"],
      ["marca_temporal", "Marca temporal"],
      ["mes", "Mes"],
      ["anio", "Año"],
      ["nombre", "Nombre actividad"],
      ["detalle", "Detalle actividad"],
      ["responsable", "Responsable"],
      ["zona", "Zona"],
      ["tipo", "Tipo actividad"],
      ["publico", "Público dirigido"],
      ["estado", "Estado actividad"],
      ["fecha", "Fecha programada"],
      ["hora_inicio", "Hora inicio"],
      ["hora_fin", "Hora finalización"],
      ["fecha_alt", "Fecha alternativa"],
      ["hora_alt", "Horario alternativo"],
      ["barrio", "Barrio"],
      ["direccion", "Dirección"],
      ["entre_calles", "Entre calles"],
      ["lugar", "Lugar específico"],
      ["lat", "Latitud"],
      ["lng", "Longitud"],
      ["articula", "Trabaja con institución"],
      ["tipo_articulacion", "Tipo articulación"],
      ["mesa", "Mesa/institución"],
      ["institucion_id", "ID Institución"],
      ["institucion_nombre", "Nombre institución"],
      ["requiere_flyer", "Requiere flyer"],
      ["estado_flyer", "Estado flyer"],
      ["link_flyer", "Link flyer"],
      ["gazebo", "Requiere gazebo"],
      ["gazebo_cant", "Cantidad gazebos"],
      ["mesas", "Requiere mesas"],
      ["mesas_cant", "Cantidad mesas"],
      ["sillas", "Requiere sillas"],
      ["sillas_cant", "Cantidad sillas"],
      ["luz", "Requiere bajada de luz"],
      ["sonido", "Requiere proyección/sonido"],
      ["otros_insumos", "Otros insumos"],
      ["costo_estimado", "Costo estimado"],
      ["costo_real", "Costo real"],
      ["obs_logistica", "Observaciones logísticas"],
      ["slug", "Slug"],
      ["link_inscripcion", "Link formulario inscripción"],
      ["inscripcion_abierta", "Inscripción abierta"],
      ["preguntas_extra", "Preguntas adicionales"],
      ["inscriptos", "Inscriptos"],
      ["presentes", "Presentes"],
      ["ausentes", "Ausentes"],
      ["pct_asistencia", "% asistencia"],
      ["resultados", "Resultados"],
      ["incidencias", "Incidencias"],
      ["fotos", "Fotos"],
      ["observaciones", "Observaciones"],
      ["origen", "Origen"],
      ["creado_por", "Creado por"],
      ...META,
    ],
    numeric: [
      "mes", "anio", "lat", "lng", "gazebo_cant", "mesas_cant", "sillas_cant", "costo_estimado", "costo_real",
      "inscriptos", "presentes", "ausentes", "pct_asistencia",
    ],
    boolean: ["articula", "requiere_flyer", "gazebo", "mesas", "sillas", "luz", "sonido", "inscripcion_abierta"],
    enums: { zona: ZONAS_ACTIVIDAD, estado: ESTADOS_ACTIVIDAD, estado_flyer: ESTADOS_FLYER },
  },
  participantes: {
    sheet: "PARTICIPANTES",
    prefix: "PAR",
    columns: [
      ["id", "ID Participante"],
      ["nombre", "Nombre"],
      ["apellido", "Apellido"],
      ["dni", "DNI"],
      ["telefono", "Teléfono"],
      ["barrio", "Barrio"],
      ["fecha_primera", "Fecha primera inscripción"],
      ["origen", "Origen alta"],
      ["consentimiento", "Consentimiento datos"],
      ["posible_duplicado_de", "Posible duplicado de"],
      ...META,
    ],
    enums: { origen: ORIGENES_INSCRIPCION },
  },
  inscripciones: {
    sheet: "INSCRIPCIONES",
    prefix: "INS",
    columns: [
      ["id", "ID Inscripción"],
      ["actividad_id", "ID Actividad"],
      ["participante_id", "ID Participante"],
      ["fecha", "Fecha inscripción"],
      ["origen", "Origen inscripción"],
      ["estado", "Estado"],
      ["respuestas", "Respuestas adicionales"],
      ...META,
    ],
    enums: { origen: ORIGENES_INSCRIPCION, estado: ESTADOS_INSCRIPCION },
  },
  asistencias: {
    sheet: "ASISTENCIAS",
    prefix: "ASI",
    columns: [
      ["id", "ID Asistencia"],
      ["actividad_id", "ID Actividad"],
      ["participante_id", "ID Participante"],
      ["estado", "Estado"],
      ["registrado", "Fecha/hora registro"],
      ["usuario", "Usuario que registró"],
      ...META,
    ],
    enums: { estado: ESTADOS_ASISTENCIA },
  },
  requerimientos: {
    sheet: "REQUERIMIENTOS",
    prefix: "REQ",
    columns: [
      ["id", "ID"],
      ["actividad_id", "ID Actividad"],
      ["tipo", "Tipo requerimiento"],
      ["descripcion", "Descripción"],
      ["cantidad", "Cantidad"],
      ["costo_estimado", "Costo estimado"],
      ["estado", "Estado"],
      ...META,
    ],
    numeric: ["cantidad", "costo_estimado"],
    enums: { estado: ESTADOS_REQUERIMIENTO },
  },
  usuarios: {
    sheet: "USUARIOS",
    prefix: "USR",
    columns: [
      ["id", "ID Usuario"],
      ["nombre", "Nombre"],
      ["apellido", "Apellido"],
      ["email", "Email"],
      ["rol", "Rol"],
      ["telefono", "Teléfono"],
      ["zona", "Zona asignada"],
      ["estado", "Estado"],
      ...META,
    ],
    enums: { rol: ROLES, zona: ZONAS, estado: ESTADOS_USUARIO },
  },
  asignaciones: {
    sheet: "ASIGNACIONES",
    prefix: "ASG",
    columns: [
      ["id", "ID Asignación"],
      ["usuario_id", "ID Usuario"],
      ["actividad_id", "ID Actividad"],
      ["estado", "Estado"],
      ...META,
    ],
    enums: { estado: ESTADOS_ASIGNACION },
  },
  instituciones: {
    sheet: "INSTITUCIONES",
    prefix: "INST",
    columns: [
      ["id", "ID Institución"],
      ["nombre", "Nombre"],
      ["tipo", "Tipo"],
      ["observaciones", "Observaciones"],
      ...META,
    ],
  },
  zonas_barrios: {
    sheet: "ZONAS_BARRIOS",
    columns: [
      ["zona", "Zona"],
      ["barrio", "Barrio"],
      ["activo", "Activo"],
    ],
    boolean: ["activo"],
    enums: { zona: ZONAS },
  },
  config: {
    sheet: "CONFIG",
    columns: [
      ["clave", "Clave"],
      ["valor", "Valor"],
      ["descripcion", "Descripción"],
    ],
  },
  auditoria: {
    sheet: "AUDITORIA",
    columns: [
      ["fecha", "Fecha"],
      ["usuario", "Usuario"],
      ["accion", "Acción"],
      ["entidad", "Entidad"],
      ["ref_id", "ID"],
      ["detalle", "Detalle"],
    ],
  },
};

export const ENTITY_TABLES: EntityTable[] = [
  "actividades", "participantes", "inscripciones", "asistencias", "requerimientos", "usuarios", "asignaciones", "instituciones",
];
export const ALL_TABLES = Object.keys(TABLES) as TableName[];

/** Encabezado de Sheets de una columna (ej. header("actividades","id") → "ID Actividad"). */
export function header(table: TableName, key: string): string {
  const col = TABLES[table].columns.find((c) => c[0] === key);
  if (!col) throw new Error(`Columna desconocida ${table}.${key}`);
  return col[1];
}

export function headers(table: TableName): string[] {
  return TABLES[table].columns.map((c) => c[1]);
}

// ---------------------------------------------------------------------------
// Conversión fila de Sheets <-> entidad
// ---------------------------------------------------------------------------

export type Row = Record<string, string | number>;

const TRUE = "SI";
const FALSE = "NO";
const TRUTHY = ["SI", "SÍ", "TRUE", "VERDADERO", "1", "X"];

export function fromRow<T>(table: TableName, row: Row): T {
  const def = TABLES[table];
  const out: Record<string, unknown> = {};
  for (const [key, head] of def.columns) {
    const raw = row[head];
    const str = raw === undefined || raw === null ? "" : String(raw).trim();
    if (key === "version" || def.numeric?.includes(key)) {
      const n = Number(str.replace(",", "."));
      out[key] = Number.isFinite(n) ? n : 0;
    } else if (def.boolean?.includes(key)) {
      out[key] = TRUTHY.includes(str.toUpperCase());
    } else {
      out[key] = str;
    }
  }
  return out as T;
}

export function toRow(table: TableName, entity: object): Row {
  const def = TABLES[table];
  const src = entity as Record<string, unknown>;
  const out: Row = {};
  for (const [key, head] of def.columns) {
    const v = src[key];
    if (typeof v === "boolean") out[head] = v ? TRUE : FALSE;
    else if (typeof v === "number") out[head] = Number.isFinite(v) ? v : 0;
    else out[head] = v === undefined || v === null ? "" : String(v);
  }
  return out;
}
