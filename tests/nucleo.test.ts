import { beforeEach, describe, expect, it } from "vitest";
import { categoriaDe, emojisDe } from "@/lib/categorias";
import { mensajeActividad } from "@/lib/compartir";
import { invalidate, setConfigValue, snapshot } from "@/lib/db";
import { cumplimiento, filtrarActividades, indicadores } from "@/lib/domain/metricas";
import { parseRegiones } from "@/lib/territorio";
import { armarFilas, sectoresDe } from "@/lib/ferias";
import type { TipoPuesto } from "@/lib/schema";
import { asignarAutomatico, asignarPuesto, cambiarEstadoFeriante, configurarFeria, generarPuestos, inscribirFeriaPublico, type FerianteInput } from "@/lib/services/ferias";
import { ubicacionLabel } from "@/lib/labels";
import { normalizeDni, normalizePhone, parseFechaFlexible, parseFechaNacimiento, parseHoraFlexible, phoneKey } from "@/lib/format";
import { parsePreguntas } from "@/lib/preguntas";
import type { Yo } from "@/lib/permisos";
import { puede } from "@/lib/permisos";
import { cerrarActividad, crearActividad, type ActividadInput } from "@/lib/services/actividades";
import { agregarPresente, guardarAsistencia } from "@/lib/services/asistencia";
import { confirmarImportacion, inscribirPublico, vistaPreviaImportacion } from "@/lib/services/inscripciones";
import { setStore } from "@/lib/store";
import { MemoryStore } from "@/lib/store/memory";

const admin: Yo = { email: "admin@lista47.test", nombre: "Admin", rol: "ADMINISTRADOR", zona: "", usuarioId: "" };
const respEste: Yo = { email: "este@lista47.test", nombre: "Resp Este", rol: "RESPONSABLE", zona: "ESTE", usuarioId: "USR-E" };

function input(p: Partial<ActividadInput> = {}): ActividadInput {
  return {
    nombre: "Taller de Fieltro", detalle: "", responsable: "noelia cabral", zona: "ESTE", localidad: "", tipo: "ESME", publico: "MUJERES", estado: "CONFIRMADA",
    fecha: "2026-10-07", hora_inicio: "14:00", hora_fin: "16:00", fecha_alt: "", hora_alt: "", barrio: "pirayui", direccion: "", entre_calles: "", lugar: "",
    lat: -27.49, lng: -58.79, articula: false, tipo_articulacion: "", mesa: "", institucion_id: "", institucion_nueva: "", institucion_nueva_tipo: "",
    requiere_flyer: false, estado_flyer: "", link_flyer: "", gazebo: false, gazebo_cant: 0, mesas: false, mesas_cant: 0, sillas: true, sillas_cant: 30,
    luz: false, sonido: false, insumos: [{ descripcion: "Lana", tipo: "MATERIALES", cantidad: 3, costo: 12000 }, { descripcion: "Agujas", tipo: "", cantidad: 10, costo: 4600 }],
    costo_estimado: null, costo_real: 0, obs_logistica: "", generar_formulario: true, preguntas_extra: "", observaciones: "", ...p,
  };
}

beforeEach(() => {
  setStore(new MemoryStore());
  invalidate();
});

describe("normalización", () => {
  it("DNI y teléfonos argentinos", () => {
    expect(normalizeDni("30.123.456")).toBe("30123456");
    expect(normalizeDni("12")).toBe("");
    expect(normalizePhone("0379 15-4123456")).toBe("3794123456");
    expect(normalizePhone("+54 9 379 4123456")).toBe("3794123456");
    expect(normalizePhone("4123456")).toBe("3794123456");
    expect(phoneKey("379-4123456")).toBe(phoneKey("0379154123456"));
  });
  it("fechas y horas del formulario anterior", () => {
    expect(parseFechaFlexible("3/06/2026")).toBe("2026-06-03");
    expect(parseFechaFlexible("27/05/2026 17:58:33")).toBe("2026-05-27");
    expect(parseFechaFlexible(46169)).toBe("2026-05-27"); // número de serie de Excel
    expect(parseHoraFlexible("19hs")).toBe("19:00");
    expect(parseHoraFlexible("16.30")).toBe("16:30");
    expect(parseHoraFlexible("9:30:00")).toBe("09:30");
    expect(parseHoraFlexible("0:00:00")).toBe("");
  });
});

describe("actividades", () => {
  it("crea con ID correlativo, slug, costo automático y barrio normalizado", async () => {
    const a = await crearActividad(input(), admin);
    expect(a.id).toBe("ACT-2026-0001");
    expect(a.slug).toBe("taller-de-fieltro");
    expect(a.costo_estimado).toBe(16600);
    expect(a.barrio).toBe("PIRAYUI");
    expect(a.responsable).toBe("Noelia Cabral");
    expect(a.mes).toBe(10);
    const b = await crearActividad(input(), admin);
    expect(b.id).toBe("ACT-2026-0002");
    expect(b.slug).toBe("taller-de-fieltro-07-10");
    const s = await snapshot({ fresh: true });
    expect(s.requerimientos.filter((r) => r.actividad_id === a.id)).toHaveLength(2);
    expect(s.barrios.map((x) => x.barrio)).toContain("PIRAYUI");
  });

  it("el responsable pide el flyer pero no lo gestiona", async () => {
    const a = await crearActividad(input({ requiere_flyer: true, estado_flyer: "PUBLICADO", link_flyer: "https://x.test/f.jpg" }), respEste);
    expect(a.estado_flyer).toBe("SOLICITADO");
    expect(a.link_flyer).toBe("");
    expect(puede.editarFlyer(respEste, a)).toBe(false);
    expect(puede.editarFlyer(admin, a)).toBe(true);
  });

  it("un responsable solo carga actividades de su zona", async () => {
    const a = await crearActividad(input({ zona: "NORTE" }), respEste);
    expect(a.zona).toBe("ESTE");
    expect(puede.editarActividad(respEste, { ...a, zona: "NORTE" })).toBe(false);
  });

  it("valida campos obligatorios salvo en borrador", async () => {
    await expect(crearActividad(input({ nombre: "", fecha: "" }), admin)).rejects.toMatchObject({ fields: { nombre: expect.any(String), fecha: expect.any(String) } });
    const b = await crearActividad(input({ estado: "BORRADOR", fecha: "", zona: "", responsable: "" }), admin);
    expect(b.estado).toBe("BORRADOR");
  });
});

describe("participantes, importación y asistencia", () => {
  it("importa sin duplicar por DNI y avisa duplicados por teléfono", async () => {
    const a = await crearActividad(input(), admin);
    const filas = [
      { nombre: "María", apellido: "González", dni: "30.111.111", telefono: "3794111111", barrio: "Pirayui", fecha: "27/05/2026 10:00:00" },
      { nombre: "Ana", apellido: "Pérez", dni: "30222222", telefono: "3794222222", barrio: "Quintana" },
      { nombre: "Ana", apellido: "Pérez", dni: "30222222", telefono: "", barrio: "" }, // repetida en el archivo
      { nombre: "Otra", apellido: "Persona", dni: "30333333", telefono: "0379 15 4111111", barrio: "" }, // mismo teléfono que María
      { nombre: "", apellido: "SinNombre", dni: "123", telefono: "", barrio: "" }, // inválida
    ];
    const previa = await vistaPreviaImportacion(a.id, filas, admin);
    expect(previa).toMatchObject({ total: 5, validas: 4, nuevos: 3, existentes: 0, repetidosEnArchivo: 1 });
    expect(previa.errores).toHaveLength(1);

    const r = await confirmarImportacion(a.id, filas, admin);
    expect(r).toMatchObject({ personasNuevas: 3, inscripcionesNuevas: 3 });
    const s = await snapshot({ fresh: true });
    expect(s.participantes).toHaveLength(3);
    const maria = s.participantes.find((p) => p.dni === "30111111")!;
    expect(maria.fecha_primera).toBe("2026-05-27");
    expect(s.participantes.find((p) => p.dni === "30333333")!.posible_duplicado_de).toBe(maria.id);

    // Segunda importación del mismo archivo: nada nuevo
    const r2 = await confirmarImportacion(a.id, filas, admin);
    expect(r2).toMatchObject({ personasNuevas: 0, inscripcionesNuevas: 0, yaInscriptos: 3 });
  });

  it("interior: regiones configurables, localidad obligatoria y cada responsable ve solo su región", async () => {
    expect(parseRegiones(["Región Bella Vista - Goya - Esquina = bella vista, GOYA, Esquina", "Norte = x"])).toEqual([
      { nombre: "BELLA VISTA - GOYA - ESQUINA", localidades: ["Bella Vista", "Goya", "Esquina"] },
    ]);
    await setConfigValue("regiones_interior", "MERCEDES - CURUZÚ = Mercedes, Curuzú Cuatiá\nPASO DE LOS LIBRES - MONTE CASEROS = Paso De Los Libres, Monte Caseros", "", "test");
    const respMercedes: Yo = { email: "m@lista47.test", nombre: "Resp M", rol: "RESPONSABLE", zona: "MERCEDES - CURUZÚ", usuarioId: "USR-M" };
    await expect(crearActividad(input({ zona: "", localidad: "" }), respMercedes)).rejects.toMatchObject({ fields: { localidad: expect.any(String) } });
    const a = await crearActividad(input({ zona: "NORTE", localidad: "mercedes", lat: -29.18, lng: -58.08 }), respMercedes);
    expect(a).toMatchObject({ zona: "MERCEDES - CURUZÚ", localidad: "Mercedes", lat: -29.18 }); // la zona la fija su rol
    await expect(crearActividad(input({ zona: "INVENTADA" }), admin)).rejects.toMatchObject({ fields: { zona: expect.any(String) } });
    // Cargando por localidad: si es de una región se asigna sola; si no, queda «Interior (sin región)».
    const porLocalidad = await crearActividad(input({ zona: "INTERIOR", localidad: "curuzu cuatia", nombre: "Charla" }), admin);
    expect(porLocalidad).toMatchObject({ zona: "MERCEDES - CURUZÚ", localidad: "Curuzú Cuatiá" });
    const sinRegion = await crearActividad(input({ zona: "INTERIOR", localidad: "santa lucía", nombre: "Operativo" }), admin);
    expect(sinRegion).toMatchObject({ zona: "INTERIOR", localidad: "Santa Lucía" });
    expect(ubicacionLabel(sinRegion)).toBe("Santa Lucía · Interior (sin región)");
    const general = await crearActividad(input({ zona: "GENERAL", nombre: "Acto central" }), admin);
    const s = await snapshot({ fresh: true });
    expect(puede.verActividad(respMercedes, general, [])).toBe(false); // lo general de Capital no le aparece
    expect(puede.verActividad(respEste, general, [])).toBe(true);
    expect(puede.verActividad(respEste, a, [])).toBe(false);
    expect(filtrarActividades(s.actividades, { ambito: "interior" }).map((x) => x.id)).toEqual([a.id, porLocalidad.id, sinRegion.id]);
    expect(filtrarActividades(s.actividades, { ambito: "capital" }).map((x) => x.id)).toEqual([general.id]);
    expect(mensajeActividad(a, { inscriptos: 0, presentes: 0 })).toContain("Mercedes · Región Mercedes - Curuzú");
  });

  it("feria: cupo cerrado, sin duplicados, puestos numerados y asignación automática", async () => {
    const a = await crearActividad(input({ nombre: "Feria de Emprendedoras", zona: "NORTE", tipo: "FERIAS DE ESME", generar_formulario: false }), admin);
    await configurarFeria(a.id, 3, admin);
    let s = await snapshot({ fresh: true });
    const feria = s.actividades.find((x) => x.id === a.id)!;
    expect(feria).toMatchObject({ es_feria: true, cupo: 3, inscripcion_abierta: true });
    expect(await generarPuestos(a.id, [{ tipo: "INDIVIDUAL", cantidad: 1 }, { tipo: "COMPARTIDO", cantidad: 1 }, { tipo: "PROPIO", cantidad: 1 }], admin)).toMatchObject({ total: 3 });
    const persona = (nombre: string, apellido: string, tel: string, extra: Partial<FerianteInput> = {}) => ({
      nombre, apellido, dni: "", telefono: tel, barrio: "", emprendimiento: `${nombre} Deco`, rubro: "Deco", lleva: [], al_lado_de: "", comparte: "SI", consentimiento: true, ...extra,
    });
    expect(await inscribirFeriaPublico(feria.slug, persona("Ana", "Pérez", "3794111111", { comparte: "NO" }))).toMatchObject({ status: "inscripta" });
    expect(await inscribirFeriaPublico(feria.slug, persona("Bea", "Gómez", "3794222222", { al_lado_de: "Carla Ruiz", rubro: "Comida" }))).toMatchObject({ status: "inscripta" });
    expect(await inscribirFeriaPublico(feria.slug, persona("Ana", "Pérez", "379 4111111", { comparte: "NO" }))).toMatchObject({ status: "ya" }); // no se duplica
    expect(await inscribirFeriaPublico(feria.slug, persona("Carla", "Ruiz", "3794333333"))).toMatchObject({ status: "inscripta" });
    expect(await inscribirFeriaPublico(feria.slug, persona("Dora", "Sosa", "3794444444"))).toMatchObject({ status: "completo" }); // cupo lleno
    s = await snapshot({ fresh: true });
    expect(s.feriantes.filter((f) => f.estado === "INSCRIPTA")).toHaveLength(3);
    expect(s.inscripciones.filter((i) => i.actividad_id === a.id)).toHaveLength(3);
    await asignarAutomatico(a.id, admin);
    s = await snapshot({ fresh: true });
    const puestoDe = (nombre: string) => {
      const p = s.participantes.find((x) => x.nombre === nombre)!;
      return s.feriantes.find((f) => f.participante_id === p.id)!.puesto;
    };
    expect(puestoDe("Ana")).toBe(1); // no comparte → individual
    expect(puestoDe("Bea")).toBe(2); // quiere estar con Carla y ambas comparten → mismo gazebo compartido
    expect(puestoDe("Carla")).toBe(2);
    // Una baja libera el cupo: ahora sí entra Dora.
    const ana = s.feriantes.find((f) => f.puesto === 1)!;
    await cambiarEstadoFeriante(ana.id, false, admin);
    expect(await inscribirFeriaPublico(feria.slug, persona("Dora", "Sosa", "3794444444", { lleva: ["Gazebo propio"] }))).toMatchObject({ status: "inscripta" });
    await asignarAutomatico(a.id, admin);
    s = await snapshot({ fresh: true });
    expect(puestoDe("Dora")).toBe(3); // trae gazebo → puesto propio
    await expect(asignarPuesto(s.feriantes.find((f) => f.puesto === 3)!.id, 2, admin)).rejects.toThrow(/completo/);
    // Cambiar los sectores: el compartido pasa a ser el sector B con 2 gazebos; las asignaciones válidas se mantienen.
    expect(await generarPuestos(a.id, [{ tipo: "INDIVIDUAL", cantidad: 1 }, { tipo: "COMPARTIDO", cantidad: 2 }], admin)).toMatchObject({ total: 3, liberadas: 0 });
    s = await snapshot({ fresh: true });
    expect(s.puestos.filter((p) => p.activo).map((p) => `${p.numero}${p.sector}${p.tipo[0]}`)).toEqual(["1AI", "2BC", "3BC"]);
    expect(puestoDe("Bea")).toBe(2);
    expect(puestoDe("Dora")).toBe(3); // su puesto ahora es compartido pero sigue teniendo lugar (en la lista aparece «revisar»)
    // Achicar: el puesto 3 desaparece y Dora queda sin puesto.
    expect(await generarPuestos(a.id, [{ tipo: "INDIVIDUAL", cantidad: 1 }, { tipo: "COMPARTIDO", cantidad: 1 }], admin)).toMatchObject({ total: 2, liberadas: 1 });
    s = await snapshot({ fresh: true });
    expect(puestoDe("Dora")).toBe(0);
  });

  it("feria: sectores del croquis", () => {
    const ps = [1, 2, 3, 4, 5].map((n) => ({ numero: n, tipo: (n <= 2 ? "INDIVIDUAL" : "COMPARTIDO") as TipoPuesto, sector: n <= 2 ? "A" : n <= 3 ? "B" : "C" }));
    expect(armarFilas(ps).map((f) => `${f.sector}:${f.puestos.length}`)).toEqual(["A:2", "B:1", "C:2"]);
    expect(sectoresDe(ps)).toEqual([{ tipo: "INDIVIDUAL", cantidad: 2 }, { tipo: "COMPARTIDO", cantidad: 1 }, { tipo: "COMPARTIDO", cantidad: 2 }]);
  });

  it("importa listas sin DNI (por teléfono) y después completa el DNI sin duplicar", async () => {
    const a = await crearActividad(input(), admin);
    const filas = [
      { nombre: "Laura Liliana", apellido: "Alegre.", dni: "", telefono: "3794703283", barrio: "" },
      { nombre: "Laura", apellido: "Alegre", dni: "", telefono: "379 470-3283", barrio: "" }, // repetida
      { nombre: "Sin", apellido: "Datos", dni: "", telefono: "", barrio: "" }, // sin DNI ni teléfono: no se puede
    ];
    const previa = await vistaPreviaImportacion(a.id, filas, admin);
    expect(previa).toMatchObject({ total: 3, validas: 2, nuevos: 1, repetidosEnArchivo: 1 });
    expect(previa.errores).toHaveLength(1);
    await confirmarImportacion(a.id, filas, admin);
    let s = await snapshot({ fresh: true });
    expect(s.participantes).toHaveLength(1);
    expect(s.participantes[0]).toMatchObject({ apellido: "Alegre", dni: "" });
    // Se inscribe después con DNI desde el formulario público: se completa la misma ficha.
    const b = await crearActividad(input({ nombre: "Otro taller", fecha: "2099-01-10" }), admin);
    await inscribirPublico(b.slug, { nombre: "Laura", apellido: "Alegre", dni: "30555666", telefono: "3794703283", barrio: "CENTRO", respuestas: [], consentimiento: true });
    s = await snapshot({ fresh: true });
    expect(s.participantes).toHaveLength(1);
    expect(s.participantes[0]).toMatchObject({ dni: "30555666", barrio: "CENTRO" });
    expect(s.inscripciones).toHaveLength(2);
  });

  it("formulario público reutiliza la persona por DNI", async () => {
    const a = await crearActividad(input({ fecha: "2099-01-10" }), admin);
    const base = { nombre: "María", apellido: "G", dni: "30111111", telefono: "3794111111", barrio: "PIRAYUI", respuestas: [], consentimiento: true };
    expect(await inscribirPublico(a.slug, base)).toMatchObject({ status: "inscripto" });
    expect(await inscribirPublico(a.slug, { ...base, nombre: "Otro nombre" })).toMatchObject({ status: "inscripto" });
    const s = await snapshot({ fresh: true });
    expect(s.participantes).toHaveLength(1);
    expect(s.participantes[0].nombre).toBe("María"); // no se pisan los datos
    expect(s.inscripciones).toHaveLength(1);
    await expect(inscribirPublico(a.slug, { ...base, consentimiento: false, dni: "30999999" })).rejects.toThrow();
  });

  it("asistencia, persona sin inscripción y cierre", async () => {
    const a = await crearActividad(input(), admin);
    await confirmarImportacion(a.id, [
      { nombre: "A", apellido: "Uno", dni: "30000001", telefono: "", barrio: "" },
      { nombre: "B", apellido: "Dos", dni: "30000002", telefono: "", barrio: "" },
      { nombre: "C", apellido: "Tres", dni: "30000003", telefono: "", barrio: "" },
    ], admin);
    let s = await snapshot({ fresh: true });
    const [p1, p2] = s.participantes;
    // Marca offline anterior + corrección posterior: gana la más reciente
    await guardarAsistencia(a.id, [
      { participanteId: p1.id, estado: "AUSENTE", ts: "2026-10-07T17:00:00Z" },
      { participanteId: p1.id, estado: "PRESENTE", ts: "2026-10-07T17:05:00Z" },
      { participanteId: p2.id, estado: "PRESENTE" },
      { participanteId: "PAR-NO-INSCRIPTO", estado: "PRESENTE" },
    ], admin);
    await agregarPresente(a.id, { nombre: "Nueva", apellido: "Llegó", dni: "40000000", telefono: "", barrio: "" }, admin);
    s = await snapshot({ fresh: true });
    expect(s.asistencias.filter((x) => x.estado === "PRESENTE")).toHaveLength(3);

    const { resumen, act } = await cerrarActividad(a.id, { costo_real: 20000, observaciones: "", resultados: "Muy bien", incidencias: "", fotos: "" }, admin);
    expect(resumen).toMatchObject({ inscriptos: 4, presentes: 3, ausentes: 1, pct: 75 });
    expect(act.estado).toBe("REALIZADA");
    s = await snapshot({ fresh: true });
    expect(s.asistencias.filter((x) => x.estado === "AUSENTE")).toHaveLength(1); // el no marcado quedó ausente
    const ind = indicadores(s.actividades, s, { anio: 2026, mes: 10 });
    expect(ind).toMatchObject({ realizadas: 1, inscriptos: 4, asistentes: 3, pctAsistencia: 75, costoReal: 20000 });
  });
});

describe("roles de solo lectura", () => {
  it("Agenda ve todas las actividades y sus números, sin datos de personas ni costos", async () => {
    const agenda: Yo = { email: "agenda@lista47.test", nombre: "Agenda", rol: "AGENDA", zona: "", usuarioId: "U-A" };
    const a = await crearActividad(input({ zona: "SUR" }), admin);
    expect(puede.verActividad(agenda, a, [])).toBe(true);
    expect(puede.verInscriptos(agenda, a, [])).toBe(false);
    expect(puede.verCostos(agenda)).toBe(false);
    expect(puede.verParticipantes(agenda)).toBe(false);
    expect(puede.editarActividad(agenda, a)).toBe(false);
    expect(puede.tomarAsistencia(agenda, a, [])).toBe(false);
    const msg = mensajeActividad(a, { inscriptos: 30, presentes: 0 });
    expect(msg).toContain("*Taller de Fieltro*");
    expect(msg).toContain("30 inscriptos");
    expect(msg).toContain("google.com/maps");
    expect(msg).not.toMatch(/\$|costo/i);
  });
});

describe("formularios", () => {
  it("fechas de nacimiento mal tipeadas y preguntas con opciones", () => {
    expect(parseFechaNacimiento("8/05/0082", "2026-09-29")).toBe("1982-05-08");
    expect(parseFechaNacimiento("14/04/1959", "2026-09-29")).toBe("1959-04-14");
    expect(parseFechaNacimiento("25/09/2026", "2026-09-29")).toBe(""); // imposible
    expect(parseFechaNacimiento("2003-02-20", "2026-09-29")).toBe("2003-02-20");
    const p = parsePreguntas("¿Fuiste alumna? [Sí / No]\n¿Profesión?");
    expect(p).toEqual([{ texto: "¿Fuiste alumna?", opciones: ["Sí", "No"] }, { texto: "¿Profesión?", opciones: null }]);
  });
});

describe("categorías del mapa", () => {
  it("agrupa por tipo y, si el tipo es genérico, por nombre", () => {
    expect(categoriaDe({ tipo: "MESA DE DEPORTES", nombre: "3x3" })).toBe("DEPORTES");
    expect(categoriaDe({ tipo: "MARCANDO HUELLAS", nombre: "Marcando Huellas y Semillero de campeones" })).toBe("DEPORTES");
    expect(categoriaDe({ tipo: "MARCANDO HUELLAS", nombre: "MarcandoHuellas" })).toBe("MASCOTAS");
    expect(categoriaDe({ tipo: "TALLER", nombre: "Clases de apoyo" })).toBe("CAPACITACIONES");
    expect(categoriaDe({ tipo: "TALLER", nombre: "Taller de barbería" })).toBe("TALLERES");
    expect(categoriaDe({ tipo: "", nombre: "Vacunación de mascotas" })).toBe("MASCOTAS");
    expect(categoriaDe({ tipo: "OPERATIVO DE SALUD", nombre: "Entrega de anteojos" })).toBe("SALUD");
    expect(categoriaDe({ tipo: "", nombre: "Algo nuevo" })).toBe("OTRAS");
    expect(emojisDe(["Deportes = 🏀"]).DEPORTES).toBe("🏀");
    expect(emojisDe([]).TALLERES).toBe("🎨");
  });
});

describe("indicadores", () => {
  it("objetivo mensual por zona: indicador, no bloqueo", async () => {
    await crearActividad(input(), admin);
    await crearActividad(input({ nombre: "Otra", estado: "PROGRAMADA" }), admin);
    await crearActividad(input({ nombre: "Cancelada", estado: "CANCELADA" }), admin);
    await crearActividad(input({ nombre: "Norte", zona: "NORTE" }), admin);
    const s = await snapshot({ fresh: true });
    const c = cumplimiento(s.actividades, 2026, 10, 2);
    expect(c).toEqual([
      { zona: "NORTE", cantidad: 1, objetivo: 2, ok: false },
      { zona: "ESTE", cantidad: 2, objetivo: 2, ok: true },
      { zona: "SUR", cantidad: 0, objetivo: 2, ok: false },
    ]);
  });
});
