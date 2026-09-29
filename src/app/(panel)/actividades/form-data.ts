import "server-only";
import type { WizardOpciones } from "@/components/actividad-wizard";
import type { Snapshot } from "@/lib/db";
import { esResponsable, puede, type Yo } from "@/lib/permisos";
import type { ActividadInput } from "@/lib/services/actividades";
import { ZONAS_ACTIVIDAD, type Actividad } from "@/lib/schema";

export function opcionesWizard(s: Snapshot, yo: Yo, actual?: Actividad): WizardOpciones {
  const estados = ["BORRADOR", "PROGRAMADA", "CONFIRMADA"];
  if (actual) estados.push("SUSPENDIDA", "CANCELADA");
  if (actual?.estado === "REALIZADA") estados.push("REALIZADA");
  return {
    zonas: esResponsable(yo) && yo.zona ? [yo.zona] : [...ZONAS_ACTIVIDAD],
    barrios: s.barrios.filter((b) => b.activo).map((b) => ({ barrio: b.barrio, zona: b.zona })),
    tipos: s.config.tipos_actividad,
    publicos: s.config.publicos,
    tiposArticulacion: s.config.tipos_articulacion,
    mesas: s.config.mesas,
    instituciones: s.instituciones.map((i) => ({ id: i.id, nombre: i.nombre, tipo: i.tipo })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    tiposInsumo: s.config.tipos_insumo,
    lugares: s.config.lugares,
    responsables: [...new Set([...s.actividades.map((a) => a.responsable), ...s.usuarios.filter((u) => u.estado === "ACTIVO").map((u) => `${u.nombre} ${u.apellido}`.trim())].filter(Boolean))].sort(),
    estados,
    gestionaFlyer: puede.editarFlyer(yo),
  };
}

export function inputVacio(yo: Yo): ActividadInput {
  return {
    nombre: "", detalle: "", responsable: yo.rol === "ADMINISTRADOR" ? "" : yo.nombre, zona: esResponsable(yo) ? yo.zona : "", tipo: "", publico: "",
    estado: "PROGRAMADA", fecha: "", hora_inicio: "", hora_fin: "", fecha_alt: "", hora_alt: "", barrio: "", direccion: "", entre_calles: "", lugar: "",
    lat: 0, lng: 0, articula: false, tipo_articulacion: "", mesa: "", institucion_id: "", institucion_nueva: "", institucion_nueva_tipo: "",
    requiere_flyer: false, estado_flyer: "", link_flyer: "", gazebo: false, gazebo_cant: 0, mesas: false, mesas_cant: 0, sillas: false, sillas_cant: 0,
    luz: false, sonido: false, insumos: [], costo_estimado: null, costo_real: 0, obs_logistica: "", generar_formulario: false, preguntas_extra: "", observaciones: "",
  };
}

export function inputDesde(a: Actividad, s: Snapshot): ActividadInput {
  const insumos = s.requerimientos
    .filter((r) => r.actividad_id === a.id && r.estado !== "ANULADO")
    .map((r) => ({ id: r.id, descripcion: r.descripcion, tipo: r.tipo, cantidad: r.cantidad, costo: r.costo_estimado }));
  const suma = insumos.reduce((x, i) => x + i.costo, 0);
  return {
    nombre: a.nombre, detalle: a.detalle, responsable: a.responsable, zona: a.zona, tipo: a.tipo, publico: a.publico, estado: a.estado,
    fecha: a.fecha, hora_inicio: a.hora_inicio, hora_fin: a.hora_fin, fecha_alt: a.fecha_alt, hora_alt: a.hora_alt,
    barrio: a.barrio, direccion: a.direccion, entre_calles: a.entre_calles, lugar: a.lugar, lat: a.lat, lng: a.lng,
    articula: a.articula, tipo_articulacion: a.tipo_articulacion, mesa: a.mesa, institucion_id: a.institucion_id, institucion_nueva: "", institucion_nueva_tipo: "",
    requiere_flyer: a.requiere_flyer, estado_flyer: a.estado_flyer, link_flyer: a.link_flyer,
    gazebo: a.gazebo, gazebo_cant: a.gazebo_cant, mesas: a.mesas, mesas_cant: a.mesas_cant, sillas: a.sillas, sillas_cant: a.sillas_cant,
    luz: a.luz, sonido: a.sonido, insumos,
    // Si el costo coincide con la suma de insumos, se sigue calculando solo.
    costo_estimado: insumos.length && a.costo_estimado === suma ? null : a.costo_estimado,
    costo_real: a.costo_real, obs_logistica: a.obs_logistica,
    generar_formulario: !!a.slug, preguntas_extra: a.preguntas_extra, observaciones: a.observaciones,
  };
}
