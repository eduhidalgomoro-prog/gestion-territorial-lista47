import { beforeEach, describe, expect, it } from "vitest";
import { categoriaDe, emojisDe } from "@/lib/categorias";
import { invalidate, snapshot } from "@/lib/db";
import { cumplimiento, indicadores } from "@/lib/domain/metricas";
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
    nombre: "Taller de Fieltro", detalle: "", responsable: "noelia cabral", zona: "ESTE", tipo: "ESME", publico: "MUJERES", estado: "CONFIRMADA",
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
