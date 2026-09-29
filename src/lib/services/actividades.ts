import "server-only";
import { insert, insertMany, log, nextSeq, readFresh, snapshot, update, updateMany, upsertBarrio, NotFoundError } from "../db";
import { env } from "../env";
import { coordsValidas } from "./geocode";
import { ForbiddenError, UserError } from "../errors";
import { withLock } from "../lock";
import { esResponsable, puede, type Yo } from "../permisos";
import {
  ESTADOS_ACTIVIDAD, ESTADOS_FLYER, ZONAS, ZONAS_ACTIVIDAD,
  type Actividad, type EstadoActividad, type EstadoFlyer, type Requerimiento, type ZonaActividad,
} from "../schema";
import { cleanString, isValidDate, isValidTime, mesAnio, normalizeBarrio, nowIso, nowLocal, pct, slugify, titleCase } from "../util";


export interface InsumoInput {
  id?: string; // si ya existía (edición)
  descripcion: string;
  tipo: string;
  cantidad: number;
  costo: number;
}

export interface ActividadInput {
  nombre: string;
  detalle: string;
  responsable: string;
  zona: string;
  tipo: string;
  publico: string;
  estado: string;
  fecha: string;
  hora_inicio: string;
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
  institucion_nueva: string;
  institucion_nueva_tipo: string;
  requiere_flyer: boolean;
  estado_flyer: string;
  link_flyer: string;
  gazebo: boolean;
  gazebo_cant: number;
  mesas: boolean;
  mesas_cant: number;
  sillas: boolean;
  sillas_cant: number;
  luz: boolean;
  sonido: boolean;
  insumos: InsumoInput[];
  costo_estimado: number | null; // null = calcular desde los insumos
  costo_real: number;
  obs_logistica: string;
  generar_formulario: boolean;
  preguntas_extra: string;
  observaciones: string;
}

/** Valida y normaliza. Devuelve los datos listos para guardar (sin id/meta). */
function validar(input: ActividadInput, yo: Yo) {
  const f: Record<string, string> = {};
  const estado = (ESTADOS_ACTIVIDAD as readonly string[]).includes(input.estado) ? (input.estado as EstadoActividad) : "PROGRAMADA";
  const borrador = estado === "BORRADOR";
  const nombre = cleanString(input.nombre, 150);
  if (!nombre) f.nombre = "Poné un nombre a la actividad.";
  let zona: ZonaActividad | "" = (ZONAS_ACTIVIDAD as readonly string[]).includes(input.zona) ? (input.zona as ZonaActividad) : "";
  // Un responsable solo carga actividades de su zona.
  if (esResponsable(yo)) zona = yo.zona;
  if (!zona && !borrador) f.zona = "Elegí la zona.";
  const fecha = cleanString(input.fecha, 10);
  if (!isValidDate(fecha) && !borrador) f.fecha = "Elegí la fecha programada.";
  const hi = cleanString(input.hora_inicio, 5);
  const hf = cleanString(input.hora_fin, 5);
  if (hi && !isValidTime(hi)) f.hora_inicio = "Hora inválida.";
  if (hf && !isValidTime(hf)) f.hora_fin = "Hora inválida.";
  if (hi && hf && isValidTime(hi) && isValidTime(hf) && hf <= hi) f.hora_fin = "Tiene que ser después del inicio.";
  const fechaAlt = cleanString(input.fecha_alt, 10);
  if (fechaAlt && !isValidDate(fechaAlt)) f.fecha_alt = "Fecha inválida.";
  const horaAlt = cleanString(input.hora_alt, 5);
  if (horaAlt && !isValidTime(horaAlt)) f.hora_alt = "Hora inválida.";
  if (!cleanString(input.responsable, 120) && !borrador) f.responsable = "Indicá quién es responsable.";
  if (Object.keys(f).length) throw new UserError("Revisá los campos marcados.", f);

  const insumos = (input.insumos ?? [])
    .map((i) => ({
      id: i.id,
      descripcion: cleanString(i.descripcion, 300),
      tipo: cleanString(i.tipo, 60),
      cantidad: Math.max(0, Math.round(Number(i.cantidad) || 0)),
      costo: Math.max(0, Math.round(Number(i.costo) || 0)),
    }))
    .filter((i) => i.descripcion)
    .slice(0, 40);
  const sumaInsumos = insumos.reduce((s, i) => s + i.costo, 0);
  const costoEstimado = input.costo_estimado === null || !Number.isFinite(input.costo_estimado) ? sumaInsumos : Math.max(0, Math.round(input.costo_estimado));

  const { mes, anio } = mesAnio(fecha);
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const ok = coordsValidas(lat, lng);
  const flyerEstado = (ESTADOS_FLYER as readonly string[]).includes(input.estado_flyer) ? (input.estado_flyer as EstadoFlyer) : "";

  return {
    insumos,
    institucion_nueva: input.articula ? cleanString(input.institucion_nueva, 150) : "",
    institucion_nueva_tipo: cleanString(input.institucion_nueva_tipo, 60),
    data: {
      mes,
      anio,
      nombre,
      detalle: cleanString(input.detalle, 2000),
      responsable: titleCase(cleanString(input.responsable, 120)),
      zona,
      tipo: cleanString(input.tipo, 80),
      publico: cleanString(input.publico, 80),
      estado,
      fecha: isValidDate(fecha) ? fecha : "",
      hora_inicio: isValidTime(hi) ? hi : "",
      hora_fin: isValidTime(hf) ? hf : "",
      fecha_alt: fechaAlt,
      hora_alt: horaAlt,
      barrio: normalizeBarrio(cleanString(input.barrio, 80)),
      direccion: cleanString(input.direccion, 150),
      entre_calles: cleanString(input.entre_calles, 150),
      lugar: cleanString(input.lugar, 150),
      lat: ok ? Math.round(lat * 1e6) / 1e6 : 0,
      lng: ok ? Math.round(lng * 1e6) / 1e6 : 0,
      articula: !!input.articula,
      tipo_articulacion: input.articula ? cleanString(input.tipo_articulacion, 80) : "",
      mesa: input.articula ? cleanString(input.mesa, 120) : "",
      institucion_id: input.articula ? cleanString(input.institucion_id, 40) : "",
      institucion_nombre: "",
      requiere_flyer: !!input.requiere_flyer,
      estado_flyer: (input.requiere_flyer ? flyerEstado || "SOLICITADO" : "") as EstadoFlyer | "",
      link_flyer: input.requiere_flyer ? cleanString(input.link_flyer, 500) : "",
      gazebo: !!input.gazebo,
      gazebo_cant: input.gazebo ? Math.max(0, Math.round(Number(input.gazebo_cant) || 0)) : 0,
      mesas: !!input.mesas,
      mesas_cant: input.mesas ? Math.max(0, Math.round(Number(input.mesas_cant) || 0)) : 0,
      sillas: !!input.sillas,
      sillas_cant: input.sillas ? Math.max(0, Math.round(Number(input.sillas_cant) || 0)) : 0,
      luz: !!input.luz,
      sonido: !!input.sonido,
      otros_insumos: insumos.map((i) => `${i.cantidad ? i.cantidad + " × " : ""}${i.descripcion}${i.costo ? ` ($${i.costo})` : ""}`).join("; "),
      costo_estimado: costoEstimado,
      costo_real: Math.max(0, Math.round(Number(input.costo_real) || 0)),
      obs_logistica: cleanString(input.obs_logistica, 1000),
      preguntas_extra: cleanString(input.preguntas_extra, 1000),
      observaciones: cleanString(input.observaciones, 2000),
    },
  };
}

/** Slug único para el link público: «taller-de-fieltro», y si ya existe «taller-de-fieltro-07-10». */
function slugUnico(nombre: string, fecha: string, existentes: Actividad[], propioId?: string) {
  const usados = new Set(existentes.filter((a) => a.id !== propioId && a.slug).map((a) => a.slug));
  const base = slugify(nombre) || "actividad";
  if (!usados.has(base)) return base;
  const conFecha = fecha ? `${base}-${fecha.slice(8, 10)}-${fecha.slice(5, 7)}` : base;
  if (!usados.has(conFecha)) return conFecha;
  let n = 2;
  while (usados.has(`${conFecha}-${n}`)) n++;
  return `${conFecha}-${n}`;
}

export function linkInscripcion(slug: string) {
  return slug ? `${env.appUrl()}/inscripcion/${slug}` : "";
}

async function resolverInstitucion(nombre: string, tipo: string, id: string, user: string) {
  const s = await snapshot();
  if (nombre) {
    const existe = s.instituciones.find((i) => i.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (existe) return { institucion_id: existe.id, institucion_nombre: existe.nombre };
    const nueva = await insert("instituciones", { nombre, tipo, observaciones: "" }, user);
    return { institucion_id: nueva.id, institucion_nombre: nueva.nombre };
  }
  if (id) {
    const inst = s.instituciones.find((i) => i.id === id);
    return { institucion_id: inst?.id ?? "", institucion_nombre: inst?.nombre ?? "" };
  }
  return { institucion_id: "", institucion_nombre: "" };
}

/** Si el barrio es nuevo, se suma a ZONAS_BARRIOS (así queda disponible en los desplegables). */
async function registrarBarrio(barrio: string, zona: string, user: string) {
  if (!barrio || !(ZONAS as readonly string[]).includes(zona)) return;
  const s = await snapshot();
  if (s.barrios.some((b) => b.barrio === barrio)) return;
  await upsertBarrio({ barrio, zona: zona as (typeof ZONAS)[number], activo: true }, user);
}

async function guardarInsumos(actividadId: string, insumos: InsumoInput[], user: string) {
  const actuales = (await readFresh("requerimientos")).filter((r) => r.actividad_id === actividadId && r.estado !== "ANULADO");
  const quedan = new Set(insumos.map((i) => i.id).filter(Boolean));
  const patches: { id: string; patch: Partial<Requerimiento> }[] = [];
  for (const r of actuales) {
    const nuevo = insumos.find((i) => i.id === r.id);
    if (!quedan.has(r.id)) patches.push({ id: r.id, patch: { estado: "ANULADO" } });
    else if (nuevo) patches.push({ id: r.id, patch: { descripcion: nuevo.descripcion, tipo: nuevo.tipo, cantidad: nuevo.cantidad, costo_estimado: nuevo.costo } });
  }
  await updateMany("requerimientos", patches, user);
  const nuevos = insumos.filter((i) => !i.id || !actuales.some((r) => r.id === i.id));
  await insertMany(
    "requerimientos",
    nuevos.map((i) => ({
      actividad_id: actividadId, tipo: i.tipo, descripcion: i.descripcion, cantidad: i.cantidad, costo_estimado: i.costo, estado: "PENDIENTE" as const,
    })),
    user,
  );
}

export async function crearActividad(input: ActividadInput, yo: Yo): Promise<Actividad> {
  if (!puede.crearActividad(yo)) throw new ForbiddenError();
  const v = validar(input, yo);
  const inst = v.data.articula ? await resolverInstitucion(v.institucion_nueva, v.institucion_nueva_tipo, v.data.institucion_id, yo.email) : { institucion_id: "", institucion_nombre: "" };
  const act = await withLock("seq:actividades", async () => {
    const [id] = await nextSeq("actividades", 1, v.data.anio || undefined);
    const existentes = await readFresh("actividades");
    const slug = input.generar_formulario ? slugUnico(v.data.nombre, v.data.fecha, existentes) : "";
    return insert(
      "actividades",
      {
        ...v.data,
        ...inst,
        id,
        marca_temporal: nowLocal(),
        slug,
        link_inscripcion: linkInscripcion(slug),
        inscripcion_abierta: !!slug,
        inscriptos: 0, presentes: 0, ausentes: 0, pct_asistencia: 0,
        resultados: "", incidencias: "", fotos: "",
        origen: "APP",
        creado_por: yo.email,
      },
      yo.email,
    );
  });
  await guardarInsumos(act.id, v.insumos, yo.email);
  await registrarBarrio(act.barrio, act.zona, yo.email);
  return act;
}

export async function editarActividad(id: string, input: ActividadInput, yo: Yo, version: number): Promise<Actividad> {
  const s = await snapshot();
  const actual = s.actividades.find((a) => a.id === id);
  if (!actual) throw new NotFoundError("La actividad");
  if (!puede.editarActividad(yo, actual)) throw new ForbiddenError("Solo podés modificar actividades de tu zona.");
  const v = validar(input, yo);
  const inst = v.data.articula ? await resolverInstitucion(v.institucion_nueva, v.institucion_nueva_tipo, v.data.institucion_id, yo.email) : { institucion_id: "", institucion_nombre: "" };
  let slug = actual.slug;
  if (input.generar_formulario && !slug) slug = slugUnico(v.data.nombre, v.data.fecha, s.actividades, id);
  const act = await update(
    "actividades",
    id,
    { ...v.data, ...inst, slug, link_inscripcion: linkInscripcion(slug), inscripcion_abierta: slug ? (actual.slug ? actual.inscripcion_abierta : true) : false },
    yo.email,
    { expectedVersion: version },
  );
  await guardarInsumos(id, v.insumos, yo.email);
  await registrarBarrio(act.barrio, act.zona, yo.email);
  return act;
}

async function actividadEditable(id: string, yo: Yo, check: (yo: Yo, a: Actividad) => boolean = puede.editarActividad) {
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a) throw new NotFoundError("La actividad");
  if (!check(yo, a)) throw new ForbiddenError();
  return a;
}

export async function cambiarEstado(id: string, estado: string, yo: Yo) {
  if (!(ESTADOS_ACTIVIDAD as readonly string[]).includes(estado)) throw new UserError("Estado inválido.");
  if (estado === "REALIZADA") throw new UserError("Para marcarla como realizada usá «Cerrar actividad».");
  await actividadEditable(id, yo);
  return update("actividades", id, { estado: estado as EstadoActividad }, yo.email, { accion: `estado → ${estado}` });
}

export async function actualizarFlyer(id: string, estado: string, link: string, yo: Yo) {
  await actividadEditable(id, yo, puede.editarFlyer);
  const e = (ESTADOS_FLYER as readonly string[]).includes(estado) ? (estado as EstadoFlyer) : "SOLICITADO";
  return update("actividades", id, { requiere_flyer: true, estado_flyer: e, link_flyer: cleanString(link, 500) }, yo.email, { accion: `flyer → ${e}` });
}

/** Genera (o reabre/cierra) el formulario público de inscripción. */
export async function formularioInscripcion(id: string, abrir: boolean, yo: Yo) {
  const a = await actividadEditable(id, yo);
  const s = await snapshot();
  const slug = a.slug || slugUnico(a.nombre, a.fecha, s.actividades, a.id);
  return update("actividades", id, { slug, link_inscripcion: linkInscripcion(slug), inscripcion_abierta: abrir }, yo.email, {
    accion: abrir ? "abrir inscripción" : "cerrar inscripción",
  });
}

export interface CierreInput {
  costo_real: number;
  observaciones: string;
  resultados: string;
  incidencias: string;
  fotos: string;
}

/** Números de asistencia calculados a partir de lo cargado. */
export function resumenAsistencia(actividadId: string, s: { inscripciones: { actividad_id: string; participante_id: string; estado: string }[]; asistencias: { actividad_id: string; participante_id: string; estado: string }[] }) {
  const inscriptos = s.inscripciones.filter((i) => i.actividad_id === actividadId && i.estado === "INSCRIPTO");
  const asis = new Map(s.asistencias.filter((a) => a.actividad_id === actividadId).map((a) => [a.participante_id, a.estado]));
  const presentes = inscriptos.filter((i) => asis.get(i.participante_id) === "PRESENTE").length;
  const ausentesMarcados = inscriptos.filter((i) => asis.get(i.participante_id) === "AUSENTE").length;
  const sinMarcar = inscriptos.length - presentes - ausentesMarcados;
  return { inscriptos: inscriptos.length, presentes, ausentes: inscriptos.length - presentes, ausentesMarcados, sinMarcar, pct: pct(presentes, inscriptos.length) };
}

/**
 * Cierre: quien estaba inscripto y no se marcó queda AUSENTE, se congelan los números
 * y la actividad pasa a REALIZADA.
 */
export async function cerrarActividad(id: string, input: CierreInput, yo: Yo) {
  const a = await actividadEditable(id, yo, puede.cerrarActividad);
  if (a.estado === "CANCELADA") throw new UserError("La actividad está cancelada: no se puede cerrar.");
  return withLock(`asis:${id}`, async () => {
    const [inscripciones, asistencias] = await Promise.all([readFresh("inscripciones"), readFresh("asistencias")]);
    const marcados = new Set(asistencias.filter((x) => x.actividad_id === id).map((x) => x.participante_id));
    const faltan = inscripciones.filter((i) => i.actividad_id === id && i.estado === "INSCRIPTO" && !marcados.has(i.participante_id));
    const registrado = nowIso();
    const nuevas = await insertMany(
      "asistencias",
      faltan.map((i) => ({ actividad_id: id, participante_id: i.participante_id, estado: "AUSENTE" as const, registrado, usuario: yo.email })),
      yo.email,
      "ausentes automáticos al cerrar",
    );
    const r = resumenAsistencia(id, { inscripciones, asistencias: [...asistencias, ...nuevas] });
    const act = await update(
      "actividades",
      id,
      {
        estado: "REALIZADA",
        inscriptos: r.inscriptos,
        presentes: r.presentes,
        ausentes: r.ausentes,
        pct_asistencia: r.pct,
        costo_real: Math.max(0, Math.round(Number(input.costo_real) || 0)),
        observaciones: cleanString(input.observaciones, 2000) || a.observaciones,
        resultados: cleanString(input.resultados, 2000),
        incidencias: cleanString(input.incidencias, 2000),
        fotos: cleanString(input.fotos, 2000),
      },
      yo.email,
      { accion: "cerrar actividad" },
    );
    return { act, resumen: r };
  });
}

export async function asignarOperador(actividadId: string, usuarioId: string, yo: Yo) {
  await actividadEditable(actividadId, yo, puede.asignarOperadores);
  const s = await snapshot();
  const u = s.usuarios.find((x) => x.id === usuarioId && x.rol === "OPERADOR" && x.estado === "ACTIVO");
  if (!u) throw new UserError("Elegí un operador activo.");
  const ya = s.asignaciones.find((x) => x.actividad_id === actividadId && x.usuario_id === usuarioId);
  if (ya?.estado === "ACTIVA") return;
  if (ya) await update("asignaciones", ya.id, { estado: "ACTIVA" }, yo.email);
  else await insert("asignaciones", { actividad_id: actividadId, usuario_id: usuarioId, estado: "ACTIVA" }, yo.email);
}

export async function quitarOperador(asignacionId: string, yo: Yo) {
  const s = await snapshot();
  const asg = s.asignaciones.find((x) => x.id === asignacionId);
  if (!asg) throw new NotFoundError("La asignación");
  await actividadEditable(asg.actividad_id, yo, puede.asignarOperadores);
  await update("asignaciones", asignacionId, { estado: "QUITADA" }, yo.email);
}

export async function registrarAuditoria(yo: Yo, accion: string, id: string, detalle = "") {
  await log(yo.email, accion, "actividades", id, detalle);
}
