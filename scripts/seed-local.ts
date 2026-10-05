/**
 * Datos de PRUEBA para desarrollo local (archivo .data/local-db.json, que nunca se sube a GitHub).
 * Sirve para probar la app en tu computadora sin tocar la planilla real.
 *
 * Uso:  npm run seed:local
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

process.env.DATA_BACKEND = "local";
const archivo = join(process.cwd(), ".data", "local-db.json");
if (existsSync(archivo)) rmSync(archivo);

async function main() {
  const { insert, insertMany, nextSeq, setConfigValue, upsertBarrio } = await import("../src/lib/db");
  const { configToValue, CONFIG_KEYS, CONFIG_LABELS, DEFAULT_CONFIG } = await import("../src/lib/config");
  const { today, mesAnio, addMonths } = await import("../src/lib/format");
  const U = "seed-local";

  for (const k of CONFIG_KEYS) await setConfigValue(k, configToValue(k, DEFAULT_CONFIG[k]), CONFIG_LABELS[k].descripcion, U);

  const barrios: [string, "NORTE" | "ESTE" | "SUR"][] = [
    ["CAMBA CUA", "NORTE"], ["INDUSTRIAL", "NORTE"], ["CENTRO", "NORTE"], ["ANAHI", "NORTE"], ["SAN BENITO", "NORTE"],
    ["QUINTANA", "ESTE"], ["PIRAYUI", "ESTE"], ["SANTA ROSA", "ESTE"], ["NUESTRA SRA DE LA POMPEYA", "ESTE"], ["SERANTES", "ESTE"],
    ["PROGRESO", "SUR"], ["LA ROSADA", "SUR"], ["YAPEYU", "SUR"], ["SAN JOSE", "SUR"],
  ];
  for (const [barrio, zona] of barrios) await upsertBarrio({ barrio, zona, activo: true }, U);

  for (const [nombre, apellido, email, rol, zona] of [
    ["Resp.", "Norte", "norte@prueba.local", "RESPONSABLE", "NORTE"],
    ["Resp.", "Este", "este@prueba.local", "RESPONSABLE", "ESTE"],
    ["Resp.", "Sur", "sur@prueba.local", "RESPONSABLE", "SUR"],
    ["Resp.", "Río Paraná", "parana@prueba.local", "RESPONSABLE", "RÍO PARANÁ"],
    ["Operador", "Prueba", "operador@prueba.local", "OPERADOR", ""],
    ["Diseño", "Prueba", "diseno@prueba.local", "DISENO", ""],
    ["Agenda", "Prueba", "agenda@prueba.local", "AGENDA", ""],
    ["Ferias", "Prueba", "ferias@prueba.local", "FERIAS", ""],
  ] as const) {
    await insert("usuarios", { nombre, apellido, email, telefono: "", rol, zona, estado: "ACTIVO" }, U);
  }

  const hoy = today();
  const { anio, mes } = mesAnio(hoy);
  const prev = addMonths(anio, mes, -1);
  const f = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const base = {
    detalle: "", localidad: "", publico: "FAMILIAS EN GENERAL", fecha_alt: "", hora_alt: "", fechas_clases: "", entre_calles: "", lugar: "Salón", articula: false,
    tipo_articulacion: "", mesa: "", institucion_id: "", institucion_nombre: "", requiere_flyer: true, estado_flyer: "PUBLICADO" as const, link_flyer: "", link_flyer_historia: "", link_grupo: "", mensaje_confirmacion: "", mensaje_grupo: "",
    gazebo: false, gazebo_cant: 0, mesas: true, mesas_cant: 2, sillas: true, sillas_cant: 30, luz: false, sonido: false, otros_insumos: "",
    costo_real: 0, obs_logistica: "", slug: "", link_inscripcion: "", inscripcion_abierta: false, preguntas_extra: "",
    inscriptos: 0, presentes: 0, ausentes: 0, pct_asistencia: 0, resultados: "", incidencias: "", fotos: "", observaciones: "", origen: "SEED", creado_por: U, es_feria: false, cupo: 0, croquis: "",
  };
  const acts = [
    { nombre: "Taller de Fieltro", tipo: "ESME", zona: "ESTE" as const, barrio: "PIRAYUI", direccion: "Suecia 727", lat: -27.4905, lng: -58.7895, fecha: f(anio, mes, 7), estado: "CONFIRMADA" as const, costo_estimado: 16600 },
    { nombre: "Marcando Huellas", tipo: "MARCANDO HUELLAS", zona: "NORTE" as const, barrio: "INDUSTRIAL", direccion: "Monteagudo y Pedro de Esnaola", lat: -27.4593, lng: -58.8146, fecha: f(anio, mes, 13), estado: "PROGRAMADA" as const, costo_estimado: 0 },
    { nombre: "Operativo de Salud Visual", tipo: "OPERATIVO DE SALUD", zona: "SUR" as const, barrio: "PROGRESO", direccion: "Ntra. Sra. de la Asunción 2500", lat: -27.5028, lng: -58.8163, fecha: f(anio, mes, 16), estado: "PROGRAMADA" as const, costo_estimado: 0 },
    { nombre: "Clínica deportiva", tipo: "MESA DE DEPORTES", zona: "NORTE" as const, barrio: "ANAHI", direccion: "Canal 12 200", lat: -27.4721, lng: -58.7822, fecha: f(prev.anio, prev.mes, 6), estado: "REALIZADA" as const, costo_estimado: 50000 },
    { nombre: "Costura Creativa", tipo: "ESME", zona: "ESTE" as const, barrio: "QUINTANA", direccion: "Pasaje Cuba 5322", lat: -27.4856, lng: -58.7952, fecha: f(prev.anio, prev.mes, 10), estado: "REALIZADA" as const, costo_estimado: 12000 },
    // Interior
    { nombre: "Feria de Emprendedoras", tipo: "FERIAS DE ESME", zona: "RÍO PARANÁ", localidad: "Goya", barrio: "", direccion: "Plaza Mitre", lat: -29.1437, lng: -59.2643, fecha: f(anio, mes, 20), estado: "PROGRAMADA" as const, costo_estimado: 0 },
  ];
  await setConfigValue("regiones_interior", "RÍO PARANÁ = Goya, Esquina, Bella Vista\nRÍO URUGUAY = Paso De Los Libres, Santo Tomé", "", U);
  const ids = await nextSeq("actividades", acts.length, anio);
  const creadas = await insertMany(
    "actividades",
    acts.map((a, i) => {
      const { mes: m, anio: y } = mesAnio(a.fecha);
      return { ...base, ...a, id: ids[i], mes: m, anio: y, marca_temporal: "", responsable: `Resp. ${a.zona.charAt(0)}${a.zona.slice(1).toLowerCase()}`, hora_inicio: "16:00", hora_fin: "18:00" };
    }),
    U,
  );

  // Personas de prueba (datos inventados)
  const nombres = ["Ana", "María", "Carolina", "Lucía", "Sofía", "Juan", "Pedro", "Laura", "Graciela", "Rosa", "Carlos", "Marta"];
  const apellidos = ["Pérez", "González", "López", "Romero", "Benítez", "Acosta", "Sosa", "Ramírez", "Fernández", "Gómez", "Duarte", "Aguirre"];
  const pids = await nextSeq("participantes", nombres.length);
  const personas = await insertMany(
    "participantes",
    nombres.map((n, i) => ({
      id: pids[i], nombre: n, apellido: apellidos[i], dni: String(30000000 + i * 1111), telefono: `37940000${String(i).padStart(2, "0")}`, ciudad: "Corrientes",
      barrio: barrios[i % barrios.length][0], direccion: "", fecha_nacimiento: "", fecha_primera: f(prev.anio, prev.mes, 1), origen: "GOOGLE FORMS" as const, consentimiento: "", posible_duplicado_de: "",
    })),
    U,
  );
  const insc = (act: number, desde: number, hasta: number) =>
    personas.slice(desde, hasta).map((p) => ({ actividad_id: creadas[act].id, participante_id: p.id, fecha: f(prev.anio, prev.mes, 1), origen: "GOOGLE FORMS" as const, estado: "INSCRIPTO" as const, respuestas: "", confirmacion: "" as const, participo_antes: "" as const, ex_alumna: "" as const, quiere_ser_profe: "" as const, ensenaria: "", conoce_espacio: "" as const, espacio: "" }));
  await insertMany("inscripciones", [...insc(0, 0, 8), ...insc(3, 4, 12), ...insc(4, 0, 6)], U);
  const reg = new Date().toISOString();
  await insertMany(
    "asistencias",
    [
      ...personas.slice(4, 12).map((p, i) => ({ actividad_id: creadas[3].id, participante_id: p.id, estado: (i < 6 ? "PRESENTE" : "AUSENTE") as "PRESENTE" | "AUSENTE", clase: 0, registrado: reg, usuario: U })),
      ...personas.slice(0, 6).map((p, i) => ({ actividad_id: creadas[4].id, participante_id: p.id, estado: (i < 5 ? "PRESENTE" : "AUSENTE") as "PRESENTE" | "AUSENTE", clase: 0, registrado: reg, usuario: U })),
    ],
    U,
  );
  console.log(`✓ Datos de prueba en ${archivo}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
