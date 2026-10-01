import "server-only";
import { insert, insertMany, readFresh, snapshot, update, updateMany, NotFoundError, type Snapshot } from "../db";
import { ForbiddenError, UserError } from "../errors";
import { CAPACIDAD, letraSector, LLEVA_OPCIONES, proponerAsignacion, type SectorFeria } from "../ferias";
import { withLock } from "../lock";
import { esResponsable, puede, type Yo } from "../permisos";
import { ambitoDe } from "../territorio";
import { TIPOS_PUESTO, type Actividad, type Feriante, type Puesto, type TipoPuesto } from "../schema";
import { cleanString, nowIso } from "../util";
import { crearActividad, formularioInscripcion } from "./actividades";
import { inscribir, inscripcionAbiertaPublica } from "./inscripciones";
import { limpiarPersona, upsertParticipantes, type PersonaInput } from "./participantes";

/**
 * Ferias de emprendedoras: cupo, inscripción, puestos numerados, croquis y asignación de lugares.
 * Una feria es una actividad con «Es feria» = SI.
 */

async function feriaEditable(actividadId: string, yo: Yo) {
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === actividadId);
  if (!a) throw new NotFoundError("La actividad");
  if (!puede.editarActividad(yo, a)) throw new ForbiddenError("Solo puede organizar la feria quien administra la actividad.");
  return { a, s };
}

export const ferianteActivas = (s: Pick<Snapshot, "feriantes">, actividadId: string) =>
  s.feriantes.filter((f) => f.actividad_id === actividadId && f.estado === "INSCRIPTA");

export const puestosDe = (s: Pick<Snapshot, "puestos">, actividadId: string) =>
  s.puestos.filter((p) => p.actividad_id === actividadId && p.activo).sort((a, b) => a.numero - b.numero);

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

export interface NuevaFeriaInput {
  nombre: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  lugar: string;
  barrio: string;
  zona: string;
  localidad: string;
  cupo: number;
  sectores: SectorFeria[];
}

/** Crea la feria en un paso: la actividad (tipo «FERIAS DE ESME»), el cupo, el formulario y los puestos. */
export async function crearFeria(datos: NuevaFeriaInput, yo: Yo): Promise<Actividad> {
  // En el interior, el campo «Barrio / localidad» es la localidad.
  const zona = esResponsable(yo) ? yo.zona : datos.zona;
  const interior = ambitoDe(zona) === "interior";
  const input = { ...datos, localidad: interior ? datos.localidad || datos.barrio : "", barrio: interior ? "" : datos.barrio };
  const a = await crearActividad(
    {
      nombre: input.nombre, detalle: "", responsable: yo.nombre, zona: input.zona, localidad: input.localidad, tipo: "FERIAS DE ESME", publico: "EMPRENDEDORES",
      estado: "PROGRAMADA", fecha: input.fecha, hora_inicio: input.hora_inicio, hora_fin: input.hora_fin, fecha_alt: "", hora_alt: "",
      barrio: input.barrio, direccion: "", entre_calles: "", lugar: input.lugar, lat: 0, lng: 0,
      articula: false, tipo_articulacion: "", mesa: "", institucion_id: "", institucion_nueva: "", institucion_nueva_tipo: "",
      requiere_flyer: false, estado_flyer: "", link_flyer: "", gazebo: false, gazebo_cant: 0, mesas: false, mesas_cant: 0, sillas: false, sillas_cant: 0,
      luz: false, sonido: false, insumos: [], costo_estimado: null, costo_real: 0, obs_logistica: "", generar_formulario: true, preguntas_extra: "", observaciones: "",
    },
    yo,
  );
  await configurarFeria(a.id, input.cupo, yo);
  if (input.sectores.some((x) => x.cantidad > 0)) await generarPuestos(a.id, input.sectores, yo);
  return a;
}

/** Convierte la actividad en feria (o actualiza el cupo). Abre el formulario público si no lo tenía. */
export async function configurarFeria(actividadId: string, cupo: number, yo: Yo) {
  const { a } = await feriaEditable(actividadId, yo);
  const c = Math.round(Number(cupo));
  if (!Number.isFinite(c) || c < 1 || c > 500) throw new UserError("El cupo tiene que ser un número entre 1 y 500.", { cupo: "Número inválido." });
  await update("actividades", actividadId, { es_feria: true, cupo: c }, yo.email, { accion: `feria: cupo ${c}` });
  if (!a.slug) await formularioInscripcion(actividadId, true, yo);
}

/**
 * Arma los puestos numerados a partir de los sectores (A, B, C… en orden), numerados de corrido (1..N).
 * Si ya existían, conserva su ubicación en el croquis y solo cambia tipo y sector; los que sobran se desactivan.
 */
export async function generarPuestos(actividadId: string, sectores: SectorFeria[], yo: Yo) {
  await feriaEditable(actividadId, yo);
  const lista = (Array.isArray(sectores) ? sectores : [])
    .filter((x) => (TIPOS_PUESTO as readonly string[]).includes(x?.tipo))
    .map((x) => ({ tipo: x.tipo, cantidad: Math.max(0, Math.min(200, Math.round(Number(x.cantidad) || 0))) }))
    .filter((x) => x.cantidad > 0)
    .slice(0, 26);
  const filas = lista.flatMap((x, i) => Array.from({ length: x.cantidad }, () => ({ tipo: x.tipo, sector: letraSector(i) })));
  if (!filas.length) throw new UserError("Indicá al menos un sector con gazebos.");
  if (filas.length > 400) throw new UserError("Son demasiados puestos (máximo 400).");
  const tipos: TipoPuesto[] = filas.map((f) => f.tipo);
  return withLock(`puestos:${actividadId}`, async () => {
    const actuales = (await readFresh("puestos")).filter((p) => p.actividad_id === actividadId);
    const porNumero = new Map(actuales.map((p) => [p.numero, p]));
    const patches: { id: string; patch: Partial<Puesto> }[] = [];
    const nuevos: Omit<Puesto, "id" | "creado" | "actualizado" | "actualizado_por" | "version">[] = [];
    filas.forEach(({ tipo, sector }, i) => {
      const ex = porNumero.get(i + 1);
      if (ex) {
        if (ex.tipo !== tipo || ex.sector !== sector || !ex.activo) patches.push({ id: ex.id, patch: { tipo, sector, activo: true } });
      } else nuevos.push({ actividad_id: actividadId, numero: i + 1, tipo, sector, x: 0, y: 0, activo: true, observaciones: "" });
    });
    for (const p of actuales) if (p.numero > tipos.length && p.activo) patches.push({ id: p.id, patch: { activo: false } });
    await updateMany("puestos", patches, yo.email, "configurar puestos");
    await insertMany("puestos", nuevos, yo.email, "puestos de la feria");
    // Las feriantes que quedaron en un puesto que ya no existe, o que ahora tiene menos lugar, pasan a «sin asignar».
    const feriantes = (await readFresh("feriantes")).filter((f) => f.actividad_id === actividadId && f.estado === "INSCRIPTA" && f.puesto);
    const ocupacion = new Map<number, number>();
    const liberar: { id: string; patch: Partial<Feriante> }[] = [];
    for (const f of feriantes) {
      const tipo = tipos[f.puesto - 1];
      const usados = (ocupacion.get(f.puesto) ?? 0) + 1;
      if (!tipo || usados > CAPACIDAD[tipo]) liberar.push({ id: f.id, patch: { puesto: 0 } });
      else ocupacion.set(f.puesto, usados);
    }
    await updateMany("feriantes", liberar, yo.email, "liberar puestos");
    return { total: tipos.length, liberadas: liberar.length };
  });
}

/** Guarda la ubicación de los puestos en el croquis (x, y en % de la imagen). */
export async function ubicarPuestos(actividadId: string, posiciones: { numero: number; x: number; y: number }[], yo: Yo) {
  const { s } = await feriaEditable(actividadId, yo);
  const pct = (v: number) => Math.max(0, Math.min(100, Math.round(Number(v) * 100) / 100));
  const porNumero = new Map(puestosDe(s, actividadId).map((p) => [p.numero, p]));
  const patches = posiciones
    .map((pos) => ({ p: porNumero.get(Number(pos.numero)), x: pct(pos.x), y: pct(pos.y) }))
    .filter((r) => r.p && (r.p.x !== r.x || r.p.y !== r.y))
    .map((r) => ({ id: r.p!.id, patch: { x: r.x, y: r.y } }));
  await updateMany("puestos", patches, yo.email, "ubicar puestos en el croquis");
  return patches.length;
}

// ---------------------------------------------------------------------------
// Asignación de lugares
// ---------------------------------------------------------------------------

export async function asignarPuesto(ferianteId: string, numero: number, yo: Yo) {
  const s = await snapshot({ fresh: true });
  const f = s.feriantes.find((x) => x.id === ferianteId);
  if (!f) throw new NotFoundError("La feriante");
  await feriaEditable(f.actividad_id, yo);
  const n = Math.round(Number(numero) || 0);
  if (n) {
    const p = puestosDe(s, f.actividad_id).find((x) => x.numero === n);
    if (!p) throw new UserError(`No existe el puesto N° ${n}.`);
    const ocupado = ferianteActivas(s, f.actividad_id).filter((x) => x.puesto === n && x.id !== f.id).length;
    if (ocupado >= CAPACIDAD[p.tipo]) throw new UserError(`El puesto N° ${n} ya está completo.`);
  }
  return update("feriantes", ferianteId, { puesto: n }, yo.email, { accion: n ? `puesto → ${n}` : "quitar puesto" });
}

/** Completa los lugares de las que todavía no tienen (no toca las ya asignadas). */
export async function asignarAutomatico(actividadId: string, yo: Yo) {
  const { s } = await feriaEditable(actividadId, yo);
  const nombres = new Map(s.participantes.map((p) => [p.id, `${p.nombre} ${p.apellido}`.trim()]));
  const activas = ferianteActivas(s, actividadId).sort((a, b) => a.creado.localeCompare(b.creado));
  const puestos = puestosDe(s, actividadId);
  if (!puestos.length) throw new UserError("Primero armá los puestos de la feria.");
  const propuesta = proponerAsignacion(
    activas.map((f) => ({ ...f, nombre: nombres.get(f.participante_id) ?? "" })),
    puestos,
  );
  await updateMany("feriantes", [...propuesta].map(([id, puesto]) => ({ id, patch: { puesto } })), yo.email, "asignación automática de puestos");
  const sinLugar = activas.filter((f) => !f.puesto && !propuesta.has(f.id)).length;
  return { asignadas: propuesta.size, sinLugar };
}

export async function quitarAsignaciones(actividadId: string, yo: Yo) {
  const { s } = await feriaEditable(actividadId, yo);
  const patches = ferianteActivas(s, actividadId).filter((f) => f.puesto).map((f) => ({ id: f.id, patch: { puesto: 0 } }));
  await updateMany("feriantes", patches, yo.email, "quitar asignaciones");
  return patches.length;
}

/** Baja (libera el cupo y el puesto) o reincorporación (si hay cupo). */
export async function cambiarEstadoFeriante(ferianteId: string, activa: boolean, yo: Yo) {
  const s = await snapshot({ fresh: true });
  const f = s.feriantes.find((x) => x.id === ferianteId);
  if (!f) throw new NotFoundError("La feriante");
  const { a } = await feriaEditable(f.actividad_id, yo);
  const ins = s.inscripciones.find((i) => i.actividad_id === a.id && i.participante_id === f.participante_id);
  if (activa) {
    if (a.cupo && ferianteActivas(s, a.id).length >= a.cupo) throw new UserError("El cupo está completo: para sumarla, primero subí el cupo o da de baja a otra.");
    await update("feriantes", ferianteId, { estado: "INSCRIPTA" }, yo.email, { accion: "reincorporar feriante" });
    await inscribir(a.id, [{ participanteId: f.participante_id }], "CARGA MANUAL", yo.email);
  } else {
    await update("feriantes", ferianteId, { estado: "BAJA", puesto: 0 }, yo.email, { accion: "baja de feriante" });
    if (ins && ins.estado === "INSCRIPTO") await update("inscripciones", ins.id, { estado: "DADO DE BAJA" }, yo.email, { accion: "baja de inscripción" });
  }
}

// ---------------------------------------------------------------------------
// Inscripción (formulario público y carga manual)
// ---------------------------------------------------------------------------

export interface FerianteInput extends PersonaInput {
  emprendimiento: string;
  rubro: string;
  lleva: string[];
  al_lado_de: string;
  comparte: string; // "SI" | "NO"
}

export function lugaresLibres(a: Actividad, s: Pick<Snapshot, "feriantes">): number | null {
  return a.cupo ? Math.max(0, a.cupo - ferianteActivas(s, a.id).length) : null;
}

function limpiarFeriante(input: FerianteInput) {
  const persona = limpiarPersona({ ...input, barrio: input.barrio ?? "" }, { telefonoObligatorio: true, dniOpcional: true });
  const f: Record<string, string> = {};
  const emprendimiento = cleanString(input.emprendimiento, 120);
  if (!emprendimiento) f.emprendimiento = "Escribí el nombre de tu emprendimiento.";
  const rubro = cleanString(input.rubro, 80);
  if (!rubro) f.rubro = "Contanos el rubro.";
  if (input.comparte !== "SI" && input.comparte !== "NO") f.comparte = "Elegí una opción.";
  if (Object.keys(f).length) throw new UserError("Revisá los campos marcados.", f);
  const lleva = (input.lleva ?? []).filter((x) => LLEVA_OPCIONES.includes(x)).join(", ");
  return { persona, datos: { emprendimiento, rubro, lleva, al_lado_de: cleanString(input.al_lado_de, 200), comparte: input.comparte === "SI" } };
}

export type ResultadoFeria =
  | { status: "inscripta"; nombre: string }
  | { status: "ya"; nombre: string }
  | { status: "cerrada" | "completo"; motivo: string };

/** Inscribe a una feriante respetando el cupo. Si ya estaba inscripta, no se duplica. */
async function anotar(a: Actividad, input: FerianteInput, origen: "FORMULARIO PROPIO" | "CARGA MANUAL", user: string): Promise<ResultadoFeria> {
  const { persona, datos } = limpiarFeriante(input);
  return withLock(`feria:${a.id}`, async () => {
    const [r] = await upsertParticipantes([persona], origen, user, origen === "FORMULARIO PROPIO" ? { consentimiento: nowIso() } : {});
    const feriantes = (await readFresh("feriantes")).filter((f) => f.actividad_id === a.id);
    const previa = feriantes.find((f) => f.participante_id === r.participante.id);
    if (previa?.estado === "INSCRIPTA") {
      await update("feriantes", previa.id, datos, user, { accion: "actualizar datos de feriante", lock: false });
      return { status: "ya", nombre: persona.nombre };
    }
    const activas = feriantes.filter((f) => f.estado === "INSCRIPTA").length;
    if (a.cupo && activas >= a.cupo) return { status: "completo", motivo: "¡Se completó el cupo de esta feria! Gracias por tu interés: vas a tener oportunidad en la próxima." };
    if (previa) await update("feriantes", previa.id, { ...datos, estado: "INSCRIPTA", puesto: 0 }, user, { accion: "reinscripción a feria", lock: false });
    else await insert("feriantes", { actividad_id: a.id, participante_id: r.participante.id, ...datos, estado: "INSCRIPTA", puesto: 0, observaciones: "" }, user);
    await inscribir(a.id, [{ participanteId: r.participante.id, respuestas: `Emprendimiento: ${datos.emprendimiento}\nRubro: ${datos.rubro}` }], origen, user);
    return { status: "inscripta", nombre: persona.nombre };
  });
}

export async function inscribirFeriaPublico(slug: string, input: FerianteInput & { consentimiento: boolean }): Promise<ResultadoFeria> {
  const s = await snapshot();
  const a = s.actividades.find((x) => x.slug === slug && x.es_feria);
  if (!a) throw new UserError("No encontramos esta feria.");
  const abierta = inscripcionAbiertaPublica(a);
  if (!abierta.abierta) return { status: "cerrada", motivo: abierta.motivo };
  if (!input.consentimiento) throw new UserError("Para inscribirte tenés que aceptar el uso de tus datos.", { consentimiento: "Marcá esta casilla para continuar." });
  return anotar(a, input, "FORMULARIO PROPIO", "formulario-publico");
}

/** Carga manual desde el panel (ej. alguien que se anotó por WhatsApp). */
export async function agregarFeriante(actividadId: string, input: FerianteInput, yo: Yo): Promise<ResultadoFeria> {
  const { a } = await feriaEditable(actividadId, yo);
  return anotar(a, input, "CARGA MANUAL", yo.email);
}
