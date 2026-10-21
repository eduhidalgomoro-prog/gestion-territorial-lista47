import "server-only";
import { insert, insertMany, readFresh, snapshot, update, updateMany, NotFoundError, type Snapshot } from "../db";
import { ForbiddenError, UserError } from "../errors";
import { CAPACIDAD, FILA_NUEVA, letraSector, LLEVA_OPCIONES, proponerAsignacion, type SectorFeria } from "../ferias";
import { withLock } from "../lock";
import { esResponsable, misZonas, puede, type Yo } from "../permisos";
import { ambitoDe } from "../territorio";
import { TIPOS_PUESTO, type Actividad, type Feriante, type Puesto, type TipoPuesto } from "../schema";
import { cleanString, normalizePhone, nowIso, phoneKey } from "../util";
import { after } from "next/server";
import { BusyError } from "../lock";
import { inicializada, inicializar, invalidarContadores, largoCola, reservar, sacarDeCola, verCola } from "../cola-feria";
import { conGrupos, esGrupo, grupoAbierto, GRUPOS_FERIA, grupoDe, MENSAJE_GRUPO_CERRADO, mismaPersona, parseCupos, unicoGrupoAbierto, unirCupos, type GrupoFeria } from "../ferias-grupos";
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
  const mias = misZonas(yo);
  const zona = esResponsable(yo) ? (mias.includes(datos.zona) ? datos.zona : mias.length === 1 ? mias[0] : "") : datos.zona;
  const interior = ambitoDe(zona) === "interior";
  const input = { ...datos, localidad: interior ? datos.localidad || datos.barrio : "", barrio: interior ? "" : datos.barrio };
  const a = await crearActividad(
    {
      nombre: input.nombre, detalle: "", responsable: yo.nombre, zona: input.zona, localidad: input.localidad, tipo: "FERIAS DE ESME", publico: "EMPRENDEDORES",
      estado: "PROGRAMADA", fecha: input.fecha, hora_inicio: input.hora_inicio, hora_fin: input.hora_fin, fecha_alt: "", hora_alt: "", clases_extra: [],
      barrio: input.barrio, direccion: "", entre_calles: "", lugar: input.lugar, lat: 0, lng: 0,
      articula: false, tipo_articulacion: "", mesa: "", institucion_id: "", institucion_nueva: "", institucion_nueva_tipo: "",
      requiere_flyer: false, estado_flyer: "", link_flyer: "", gazebo: false, gazebo_cant: 0, mesas: false, mesas_cant: 0, sillas: false, sillas_cant: 0,
      luz: false, sonido: false, insumos: [], costo_estimado: null, costo_real: 0, obs_logistica: "", generar_formulario: true, preguntas_extra: "", observaciones: "",
    },
    yo,
    { feria: true },
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
  await invalidarContadores(actividadId);
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

/** Dos feriantes se cambian de lugar (cada una queda en el puesto de la otra). */
export async function intercambiarPuestos(ferianteA: string, ferianteB: string, yo: Yo) {
  const s = await snapshot({ fresh: true });
  const a = s.feriantes.find((x) => x.id === ferianteA);
  const b = s.feriantes.find((x) => x.id === ferianteB);
  if (!a || !b || a.actividad_id !== b.actividad_id) throw new NotFoundError("La feriante");
  await feriaEditable(a.actividad_id, yo);
  if (a.puesto === b.puesto) return;
  await updateMany(
    "feriantes",
    [
      { id: a.id, patch: { puesto: b.puesto } },
      { id: b.id, patch: { puesto: a.puesto } },
    ],
    yo.email,
    `intercambio de puestos ${a.puesto || "sin puesto"} ↔ ${b.puesto || "sin puesto"}`,
  );
}

/**
 * Cambios puntuales de puestos (después de armarlos): agregar uno en una fila, sacar uno, cambiar su tipo.
 * Los números siguen de corrido: al agregar o sacar, los puestos que siguen (y sus feriantes) se corren uno.
 */
async function editarPuestos(actividadId: string, yo: Yo, accion: string, fn: (puestos: Puesto[], feriantes: Feriante[]) => { puestos: { id: string; patch: Partial<Puesto> }[]; feriantes: { id: string; patch: Partial<Feriante> }[]; nuevo?: Omit<Puesto, "id" | "creado" | "actualizado" | "actualizado_por" | "version"> }) {
  await feriaEditable(actividadId, yo);
  return withLock(`puestos:${actividadId}`, async () => {
    const puestos = (await readFresh("puestos")).filter((p) => p.actividad_id === actividadId);
    const feriantes = (await readFresh("feriantes")).filter((f) => f.actividad_id === actividadId);
    const r = fn(puestos, feriantes);
    await updateMany("puestos", r.puestos, yo.email, accion);
    if (r.nuevo) await insert("puestos", r.nuevo, yo.email);
    await updateMany("feriantes", r.feriantes, yo.email, accion);
    return { corridos: r.feriantes.filter((x) => x.patch.puesto).length };
  });
}

/** Agrega un puesto al final de una fila (sector). Los que siguen se corren un número. */
export async function agregarPuesto(actividadId: string, sector: string, tipo: TipoPuesto, yo: Yo) {
  if (!(TIPOS_PUESTO as readonly string[]).includes(tipo)) throw new UserError("Tipo de puesto inválido.");
  return editarPuestos(actividadId, yo, "agregar puesto", (puestos, feriantes) => {
    const activos = puestos.filter((p) => p.activo).sort((a, b) => a.numero - b.numero);
    if (activos.length >= 400) throw new UserError("Son demasiados puestos (máximo 400).");
    const delSector = sector === FILA_NUEVA ? [] : activos.filter((p) => p.sector === sector);
    // Al final de la fila elegida; si la fila no existe, una fila nueva al final.
    const numero = delSector.length ? delSector[delSector.length - 1].numero + 1 : (activos[activos.length - 1]?.numero ?? 0) + 1;
    const letra = delSector.length ? sector : letraSector(new Set(activos.map((p) => p.sector)).size);
    return {
      puestos: puestos.filter((p) => p.numero >= numero && p.numero > 0).map((p) => ({ id: p.id, patch: { numero: p.numero + 1 } })),
      feriantes: feriantes.filter((f) => f.puesto >= numero).map((f) => ({ id: f.id, patch: { puesto: f.puesto + 1 } })),
      nuevo: { actividad_id: actividadId, numero, tipo, sector: letra, x: 0, y: 0, activo: true, observaciones: "" },
    };
  });
}

/** Saca un puesto: quien estaba ahí queda «sin puesto» y los que siguen se corren un número para abajo. */
export async function eliminarPuesto(actividadId: string, numero: number, yo: Yo) {
  return editarPuestos(actividadId, yo, `sacar puesto ${numero}`, (puestos, feriantes) => {
    const p = puestos.find((x) => x.activo && x.numero === numero);
    if (!p) throw new UserError(`No existe el puesto N° ${numero}.`);
    return {
      puestos: [
        { id: p.id, patch: { activo: false, numero: 0 } },
        ...puestos.filter((x) => x.id !== p.id && x.numero > numero).map((x) => ({ id: x.id, patch: { numero: x.numero - 1 } })),
      ],
      feriantes: feriantes
        .filter((f) => f.puesto >= numero)
        .map((f) => ({ id: f.id, patch: { puesto: f.puesto === numero ? 0 : f.puesto - 1 } })),
    };
  });
}

/** Cambia el tipo de un puesto. Si ahora entra menos gente, la última que se había asignado queda sin puesto. */
export async function cambiarTipoPuesto(actividadId: string, numero: number, tipo: TipoPuesto, yo: Yo) {
  if (!(TIPOS_PUESTO as readonly string[]).includes(tipo)) throw new UserError("Tipo de puesto inválido.");
  return editarPuestos(actividadId, yo, `puesto ${numero} → ${tipo}`, (puestos, feriantes) => {
    const p = puestos.find((x) => x.activo && x.numero === numero);
    if (!p) throw new UserError(`No existe el puesto N° ${numero}.`);
    const ahi = feriantes.filter((f) => f.estado === "INSCRIPTA" && f.puesto === numero).sort((a, b) => a.actualizado.localeCompare(b.actualizado));
    return {
      puestos: p.tipo === tipo ? [] : [{ id: p.id, patch: { tipo } }],
      feriantes: ahi.slice(CAPACIDAD[tipo]).map((f) => ({ id: f.id, patch: { puesto: 0 } })),
    };
  });
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
    if (!hayLugarEnGrupo(a, esGrupo(f.grupo) ? f.grupo : "", ferianteActivas(s, a.id))) throw new UserError("El cupo de su grupo está completo: cambiale el grupo, subí ese cupo o da de baja a otra.");
    await update("feriantes", ferianteId, { estado: "INSCRIPTA" }, yo.email, { accion: "reincorporar feriante" });
    await inscribir(a.id, [{ participanteId: f.participante_id }], "CARGA MANUAL", yo.email);
  } else {
    await update("feriantes", ferianteId, { estado: "BAJA", puesto: 0 }, yo.email, { accion: "baja de feriante" });
    if (ins && ins.estado === "INSCRIPTO") await update("inscripciones", ins.id, { estado: "DADO DE BAJA" }, yo.email, { accion: "baja de inscripción" });
  }
  await invalidarContadores(a.id); // se liberó u ocupó un lugar
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

const COMPLETO = "¡Se completó el cupo de esta feria! Gracias por tu interés: vas a tener oportunidad en la próxima.";

/** Grupo de una feriante en una feria con cupo por grupos ("" si la feria no usa grupos). */
async function grupoPara(a: Actividad, persona: { nombre: string; apellido: string; telefono: string }, forzado?: string): Promise<GrupoFeria | ""> {
  if (!conGrupos(a)) return "";
  if (forzado && esGrupo(forzado)) return forzado;
  const lista = (await snapshot()).listas_feria.filter((l) => l.actividad_id === a.id);
  return grupoDe({ nombre: `${persona.nombre} ${persona.apellido}`, telefono: persona.telefono }, lista);
}

/** ¿Queda lugar en el grupo? (ferias con cupo por grupos). */
function hayLugarEnGrupo(a: Actividad, grupo: GrupoFeria | "", activas: Feriante[]): boolean {
  if (!grupo) return true;
  const cupo = parseCupos(a.cupos_grupos)[grupo];
  return cupo === undefined || activas.filter((f) => f.grupo === grupo).length < cupo;
}

/** Inscribe a una feriante respetando el cupo (y el de su grupo, si la feria tiene grupos). Si ya estaba inscripta, no se duplica. */
async function anotar(a: Actividad, input: FerianteInput, origen: "FORMULARIO PROPIO" | "CARGA MANUAL", user: string, grupoForzado?: string): Promise<ResultadoFeria> {
  const { persona, datos } = limpiarFeriante(input);
  const grupo = await grupoPara(a, persona, grupoForzado);
  return withLock(`feria:${a.id}`, async () => {
    const [r] = await upsertParticipantes([persona], origen, user, origen === "FORMULARIO PROPIO" ? { consentimiento: nowIso() } : {});
    const feriantes = (await readFresh("feriantes")).filter((f) => f.actividad_id === a.id);
    const previa = feriantes.find((f) => f.participante_id === r.participante.id);
    if (previa?.estado === "INSCRIPTA") {
      await update("feriantes", previa.id, datos, user, { accion: "actualizar datos de feriante", lock: false });
      return { status: "ya", nombre: persona.nombre };
    }
    // Cuentan también las que se reservaron por la inscripción rápida y todavía se están guardando.
    const enCola = (await verCola(a.id)).map((x) => ({ grupo: (JSON.parse(x) as EnCola).grupo }) as Feriante);
    const activas = [...feriantes.filter((f) => f.estado === "INSCRIPTA"), ...enCola];
    if (a.cupo && activas.length >= a.cupo) return { status: "completo", motivo: COMPLETO };
    if (!hayLugarEnGrupo(a, grupo, activas)) return { status: "completo", motivo: COMPLETO };
    if (previa) await update("feriantes", previa.id, { ...datos, estado: "INSCRIPTA", puesto: 0, grupo }, user, { accion: "reinscripción a feria", lock: false });
    else await insert("feriantes", { actividad_id: a.id, participante_id: r.participante.id, ...datos, estado: "INSCRIPTA", puesto: 0, grupo, observaciones: "" }, user);
    await inscribir(a.id, [{ participanteId: r.participante.id, respuestas: `Emprendimiento: ${datos.emprendimiento}\nRubro: ${datos.rubro}` }], origen, user);
    return { status: "inscripta", nombre: persona.nombre };
  });
}

/**
 * Inscripción pública RÁPIDA: el lugar se reserva al instante (Redis, sin pasarse del cupo ni del de cada grupo)
 * y la inscripción se guarda en la planilla después, en tandas (ver vaciarCola). Soporta picos de muchas personas a la vez.
 */
export async function inscribirFeriaPublico(slug: string, input: FerianteInput & { consentimiento: boolean }): Promise<ResultadoFeria> {
  const { resultado, actividadId } = await reservarLugarFeria(slug, input);
  if (resultado.status === "inscripta" && actividadId) await despues(() => vaciarCola(actividadId));
  return resultado;
}

/** Solo la reserva del lugar (instantánea); el guardado en la planilla lo hace vaciarCola. */
export async function reservarLugarFeria(slug: string, input: FerianteInput & { consentimiento: boolean }): Promise<{ resultado: ResultadoFeria; actividadId: string }> {
  const s = await snapshot();
  const a = s.actividades.find((x) => x.slug === slug && x.es_feria);
  if (!a) throw new UserError("No encontramos esta feria.");
  const abierta = inscripcionAbiertaPublica(a);
  if (!abierta.abierta) return { resultado: { status: "cerrada", motivo: abierta.motivo }, actividadId: a.id };
  if (!input.consentimiento) throw new UserError("Para inscribirte tenés que aceptar el uso de tus datos.", { consentimiento: "Marcá esta casilla para continuar." });
  const { persona, datos } = limpiarFeriante(input);
  const grupo = unicoGrupoAbierto(a) ?? ((await grupoPara(a, persona)) || "TODAS");
  if (conGrupos(a) && !grupoAbierto(a, grupo)) return { resultado: { status: "cerrada", motivo: MENSAJE_GRUPO_CERRADO }, actividadId: a.id };
  const cupos = parseCupos(a.cupos_grupos);
  const maxGrupo = conGrupos(a) ? cupos[grupo as GrupoFeria] ?? 0 : -1;
  const claves = clavesPersona(persona);
  const payload = JSON.stringify({ persona, datos, grupo: grupo === "TODAS" ? "" : grupo, consentimiento: nowIso() } satisfies EnCola);
  let r = await reservar(a.id, grupo, maxGrupo, a.cupo || 0, claves, payload);
  if (r === "init") {
    await armarContadores(a.id);
    r = await reservar(a.id, grupo, maxGrupo, a.cupo || 0, claves, payload);
  }
  const resultado: ResultadoFeria =
    r === "ok" ? { status: "inscripta", nombre: persona.nombre } : r === "ya" ? { status: "ya", nombre: persona.nombre } : { status: "completo", motivo: COMPLETO };
  return { resultado, actividadId: a.id };
}

/** Lo que espera en la cola hasta guardarse en la planilla. */
interface EnCola {
  persona: ReturnType<typeof limpiarFeriante>["persona"];
  datos: ReturnType<typeof limpiarFeriante>["datos"];
  grupo: string;
  consentimiento: string;
}

/** Claves para no anotar dos veces a la misma persona: su teléfono y su DNI. */
function clavesPersona(p: { telefono: string; dni: string }): string[] {
  return [phoneKey(p.telefono) && `tel:${phoneKey(p.telefono)}`, p.dni && `dni:${p.dni}`].filter(Boolean) as string[];
}

/** Corre después de responder (en Vercel no frena a quien se inscribe); fuera de un pedido web (scripts, pruebas), en el momento. */
async function despues(fn: () => Promise<unknown>) {
  try {
    after(() => fn().catch((e) => console.error("[feria] guardar inscripciones", e)));
  } catch {
    await fn().catch((e) => console.error("[feria] guardar inscripciones", e));
  }
}

/** Arma los contadores de lugares con lo que ya está en la planilla + lo que espera en la cola. */
async function armarContadores(actividadId: string) {
  // Si llegan muchas juntas, una sola arma los contadores; las demás no hacen fila: esperan a que estén listos.
  const hasta = Date.now() + 25_000;
  while (true) {
    if (await inicializada(actividadId)) return;
    try {
      await withLock(`feria:${actividadId}`, () => armarContadoresYa(actividadId), { waitMs: 0, ttlMs: 20_000 });
      return;
    } catch (e) {
      if (!(e instanceof BusyError) || Date.now() > hasta) throw e;
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 100));
    }
  }
}

async function armarContadoresYa(actividadId: string) {
  // Si mientras esperaba ya los armó otra, no se vuelve a leer la planilla.
  if (await inicializada(actividadId)) return;
  const [feriantes, participantes] = await Promise.all([readFresh("feriantes"), readFresh("participantes")]);
  const personas = new Map(participantes.map((p) => [p.id, p]));
  const activas = feriantes.filter((f) => f.actividad_id === actividadId && f.estado === "INSCRIPTA");
  const porGrupo: Record<string, number> = {};
  const claves: string[] = [];
  const sumar = (grupo: string, p?: { telefono: string; dni: string }) => {
    const g = grupo || "TODAS";
    porGrupo[g] = (porGrupo[g] ?? 0) + 1;
    if (p) claves.push(...clavesPersona(p));
  };
  for (const f of activas) sumar(f.grupo, personas.get(f.participante_id));
  for (const x of await verCola(actividadId)) {
    const e = JSON.parse(x) as EnCola;
    sumar(e.grupo, e.persona);
  }
  const total = Object.values(porGrupo).reduce((n, v) => n + v, 0);
  for (const g of GRUPOS_FERIA) porGrupo[g] ??= 0;
  porGrupo.TODAS ??= 0;
  await inicializar(actividadId, { porGrupo, total, claves });
}

/**
 * Guarda en la planilla, en tandas, las inscripciones que esperan en la cola (pocas escrituras aunque sean muchas).
 * Lo hace una sola instancia a la vez; si quedan pendientes (por ejemplo, Google tardó), se reintenta en el próximo envío.
 */
export async function vaciarCola(actividadId: string) {
  for (let vuelta = 0; vuelta < 30; vuelta++) {
    if (!(await largoCola(actividadId))) return;
    const hecho = await withLock(
      `feria:${actividadId}`,
      async () => {
        const lote = await verCola(actividadId, 40);
        if (!lote.length) return 0;
        const items = lote.map((x) => JSON.parse(x) as EnCola);
        const s = await snapshot();
        const a = s.actividades.find((x) => x.id === actividadId);
        if (!a) return 0;
        const res = await upsertParticipantes(items.map((i) => i.persona), "FORMULARIO PROPIO", "formulario-publico", { consentimiento: items[0].consentimiento });
        const feriantes = (await readFresh("feriantes")).filter((f) => f.actividad_id === actividadId);
        const porPart = new Map(feriantes.map((f) => [f.participante_id, f]));
        const crear: Omit<Feriante, "id" | "creado" | "actualizado" | "actualizado_por" | "version">[] = [];
        const reactivar: { id: string; patch: Partial<Feriante> }[] = [];
        const vistos = new Set<string>();
        const aInscribir: { participanteId: string; respuestas: string }[] = [];
        let sobran = 0;
        items.forEach((it, i) => {
          const pid = res[i].participante.id;
          const previa = porPart.get(pid);
          if (vistos.has(pid) || previa?.estado === "INSCRIPTA") {
            sobran++; // ya estaba (misma persona con otro teléfono): no se duplica
            return;
          }
          vistos.add(pid);
          if (previa) reactivar.push({ id: previa.id, patch: { ...it.datos, estado: "INSCRIPTA", puesto: 0, grupo: it.grupo } });
          else crear.push({ actividad_id: actividadId, participante_id: pid, ...it.datos, estado: "INSCRIPTA", puesto: 0, grupo: it.grupo, observaciones: "" });
          aInscribir.push({ participanteId: pid, respuestas: `Emprendimiento: ${it.datos.emprendimiento}\nRubro: ${it.datos.rubro}` });
        });
        await updateMany("feriantes", reactivar, "formulario-publico", "reinscripción a feria");
        await insertMany("feriantes", crear, "formulario-publico", "inscripción rápida a feria");
        await inscribir(actividadId, aInscribir, "FORMULARIO PROPIO", "formulario-publico");
        await sacarDeCola(actividadId, lote.length);
        // Si alguna sobró (ya estaba), los contadores quedaron de más: se rearman.
        if (sobran) await invalidarContadores(actividadId);
        return lote.length;
      },
      { waitMs: 25_000, ttlMs: 60_000 },
    ).catch((e) => {
      if (e instanceof BusyError) return -1; // otra instancia está guardando: ella sigue
      throw e;
    });
    if (hecho <= 0) return;
  }
}

/** Cuántas inscripciones esperan para guardarse (para mostrarlo en la feria). */
export const pendientesDeGuardar = (actividadId: string) => largoCola(actividadId);

/** Carga manual desde el panel (ej. alguien que se anotó por WhatsApp). En ferias con grupos se puede elegir el grupo. */
export async function agregarFeriante(actividadId: string, input: FerianteInput, yo: Yo, grupo = ""): Promise<ResultadoFeria> {
  const { a } = await feriaEditable(actividadId, yo);
  const r = await anotar(a, input, "CARGA MANUAL", yo.email, grupo);
  await invalidarContadores(actividadId);
  return r;
}

// ---------------------------------------------------------------------------
// Cupo por grupos (originales / segundo grupo / extras)
// ---------------------------------------------------------------------------

/** Reparte el cupo en grupos (0 en todos = un solo cupo, como antes). El cupo total pasa a ser la suma. */
export async function configurarGrupos(actividadId: string, cupos: Partial<Record<GrupoFeria, number>>, yo: Yo) {
  await feriaEditable(actividadId, yo);
  const limpio: Partial<Record<GrupoFeria, number>> = {};
  for (const g of GRUPOS_FERIA) {
    const n = Math.round(Number(cupos[g]) || 0);
    if (n < 0 || n > 500) throw new UserError("Cada cupo tiene que ser un número entre 0 y 500.", { [`cupo_${g}`]: "Número inválido." });
    if (n > 0) limpio[g] = n;
  }
  const total = Object.values(limpio).reduce((x, n) => x + n, 0);
  if (total > 500) throw new UserError("El cupo total no puede pasar de 500.");
  await update("actividades", actividadId, total ? { cupos_grupos: unirCupos(limpio), cupo: total } : { cupos_grupos: "" }, yo.email, { accion: `feria: cupos por grupo ${unirCupos(limpio) || "(sin grupos)"}` });
  await invalidarContadores(actividadId);
  return { total };
}

/** Qué grupos pueden inscribirse por el formulario (los demás ven «todavía no abrió para vos»). */
export async function abrirGrupos(actividadId: string, abiertos: string[], yo: Yo) {
  await feriaEditable(actividadId, yo);
  const cerrados = GRUPOS_FERIA.filter((g) => !abiertos.includes(g));
  await update("actividades", actividadId, { grupos_cerrados: cerrados.join(",") }, yo.email, { accion: `feria: abiertos ${abiertos.filter(esGrupo).join(",") || "ninguno"}` });
}

/** La encargada cambia el grupo de una feriante (ej. el cruce por nombre no la reconoció). */
export async function cambiarGrupoFeriante(ferianteId: string, grupo: string, yo: Yo) {
  if (!esGrupo(grupo)) throw new UserError("Grupo inválido.");
  const s = await snapshot({ fresh: true });
  const f = s.feriantes.find((x) => x.id === ferianteId);
  if (!f) throw new NotFoundError("La feriante");
  await feriaEditable(f.actividad_id, yo);
  if (f.grupo !== grupo) await update("feriantes", ferianteId, { grupo }, yo.email, { accion: `grupo → ${grupo}` });
  await invalidarContadores(f.actividad_id);
}

/**
 * Carga la lista de un grupo (originales o segundo grupo). Junta repetidas (misma persona por teléfono o nombre)
 * y no vuelve a cargar a quien ya está en la lista. Después reacomoda el grupo de las que ya se inscribieron.
 */
export async function cargarListaFeria(actividadId: string, grupo: "ORIGINAL" | "ESPERA", filas: { nombre: string; telefono: string; emprendimiento: string }[], yo: Yo) {
  await feriaEditable(actividadId, yo);
  return withLock(`feria:${actividadId}`, async () => {
    const existentes = (await readFresh("listas_feria")).filter((l) => l.actividad_id === actividadId);
    const nuevas: { nombre: string; telefono: string; emprendimiento: string }[] = [];
    for (const fila of filas) {
      const p = { nombre: cleanString(fila.nombre, 120), telefono: normalizePhone(cleanString(fila.telefono, 40)), emprendimiento: cleanString(fila.emprendimiento, 120) };
      if (!p.nombre) continue;
      const ya = [...existentes.filter((l) => l.grupo === grupo), ...nuevas].some((l) => mismaPersona(l, p));
      if (!ya) nuevas.push(p);
    }
    await insertMany("listas_feria", nuevas.map((p) => ({ actividad_id: actividadId, grupo, ...p })), yo.email, `lista de feria: ${grupo}`);
    // Las que ya estaban inscriptas se reacomodan según las listas.
    const s = await snapshot({ fresh: true });
    const lista = s.listas_feria.filter((l) => l.actividad_id === actividadId);
    const personas = new Map(s.participantes.map((p) => [p.id, p]));
    const patches = ferianteActivas(s, actividadId)
      .map((f) => {
        const p = personas.get(f.participante_id);
        const g = grupoDe({ nombre: `${p?.nombre ?? ""} ${p?.apellido ?? ""}`, telefono: p?.telefono ?? "" }, lista);
        return { id: f.id, patch: { grupo: g }, cambia: f.grupo !== g };
      })
      .filter((x) => x.cambia)
      .map(({ id, patch }) => ({ id, patch }));
    await updateMany("feriantes", patches, yo.email, "reacomodar grupos según las listas");
    await invalidarContadores(actividadId);
    return { cargadas: nuevas.length, repetidas: filas.length - nuevas.length, reacomodadas: patches.length };
  });
}

/** Personas de las listas que todavía no se inscribieron (para avisarles). */
export function faltanInscribirse(a: Actividad, s: Pick<Snapshot, "listas_feria" | "feriantes" | "participantes">) {
  const personas = new Map(s.participantes.map((p) => [p.id, p]));
  const inscriptas = ferianteActivas(s, a.id).map((f) => {
    const p = personas.get(f.participante_id);
    return { nombre: `${p?.nombre ?? ""} ${p?.apellido ?? ""}`, telefono: p?.telefono ?? "" };
  });
  return s.listas_feria.filter((l) => l.actividad_id === a.id && !inscriptas.some((i) => mismaPersona(i, l)));
}
