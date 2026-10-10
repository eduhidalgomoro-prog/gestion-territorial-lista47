/**
 * Trae las actividades cargadas con el Google Forms anterior (hoja «Respuestas de formulario 1»)
 * a la hoja ACTIVIDADES de la app, normalizando zonas, fechas, horarios y barrios, y ubicándolas en el mapa.
 *
 * - NO modifica ni borra la hoja del formulario: solo la lee.
 * - Se puede ejecutar varias veces: las filas ya migradas se reconocen y se saltean.
 * - Agua saborizada y golosinas no se migran (ya no se piden).
 *
 * Uso:  npm run migrar:formulario -- --probar     (muestra lo que haría, sin escribir nada)
 *       npm run migrar:formulario                 (migra de verdad)
 *       Opciones: --hoja "Nombre de la hoja"  --sin-mapa (no geolocaliza)
 */
import { auth, sheets } from "@googleapis/sheets";
import { insert, insertMany, nextSeq, readFresh, snapshot, upsertBarrio, type NewEntity } from "../src/lib/db";
import { normalizeBarrio, normalizeText, parseFechaFlexible, parseHoraFlexible, slugify, titleCase, today } from "../src/lib/format";
import type { EstadoActividad, Zona, ZonaActividad } from "../src/lib/schema";
import { geocodificar } from "../src/lib/services/geocode";

const args = process.argv.slice(2);
const probar = args.includes("--probar");
const sinMapa = args.includes("--sin-mapa");
const hoja = args.includes("--hoja") ? args[args.indexOf("--hoja") + 1] : "Respuestas de formulario 1";
// Las respuestas del Google Forms viven en la planilla original (compartida con el equipo);
// la app guarda sus datos en otra planilla privada (GOOGLE_SHEETS_SPREADSHEET_ID).
const PLANILLA_FORMULARIO = args.includes("--origen") ? args[args.indexOf("--origen") + 1] : "1UHcwgAjpARlDxrAlIWA7sE-W5KRDGG3GY_DKI55S78g";
const USER = "migracion-formulario";

if (process.env.DATA_BACKEND !== "sheets" && !probar) {
  console.error("✗ Para migrar de verdad, DATA_BACKEND tiene que ser 'sheets' en .env.local.");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const si = (v: string) => /^s[ií]/i.test(v.trim());
const vacio = (v: string) => !v.trim() || /^(no|\.+|-+|no requiero ninguno|0)$/i.test(v.trim());

function cantidad(v: string): number {
  const s = normalizeText(v);
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  if (Number.isFinite(n)) return n;
  const palabras: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, diez: 10 };
  return palabras[s.split(" ")[0]] ?? 0;
}

/** Suma los montos «$16.600», «$50.000» que aparecen en el texto de otros insumos. */
function montos(texto: string): number {
  const total = texto.match(/total\s*:?\s*\$\s*([\d.]+)/i);
  if (total) return Number(total[1].replace(/\./g, "")) || 0;
  return [...texto.matchAll(/\$\s*([\d.]+)/g)].reduce((s, m) => s + (Number(m[1].replace(/\./g, "")) || 0), 0);
}

function zonaDe(v: string): ZonaActividad | "" {
  const s = normalizeText(v);
  if (/norte/.test(s)) return "NORTE";
  if (/este/.test(s)) return "ESTE";
  if (/sur/.test(s)) return "SUR";
  if (/todas|general/.test(s)) return "GENERAL";
  return "";
}

function tipoDe(mesa: string, nombre: string): string {
  const m = normalizeText(mesa);
  if (/ferias? de esme/.test(m)) return "FERIAS DE ESME";
  if (/esme/.test(m)) return "ESME";
  if (/marcando huellas/.test(m)) return "MARCANDO HUELLAS";
  if (/deporte/.test(m)) return "MESA DE DEPORTES";
  const n = normalizeText(nombre);
  if (/marcando ?huellas/.test(n)) return "MARCANDO HUELLAS";
  if (/salud|anteojos/.test(n)) return "OPERATIVO DE SALUD";
  if (/feria/.test(n)) return "FERIAS DE ESME";
  if (/torneo|basquet|deportiva|futbol|3x3/.test(n)) return "MESA DE DEPORTES";
  if (/capacitaci|finanzas/.test(n)) return "CAPACITACIÓN";
  if (/taller|clases?|costura|atelier|elaboraci|acordeon|folclore/.test(n)) return "TALLER";
  return "";
}

async function main() {
  const spreadsheetId = PLANILLA_FORMULARIO;
  const api = sheets({
    version: "v4",
    auth: new auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    }),
  });
  // FORMATTED_VALUE: se lee lo mismo que se ve (evita errores de zona horaria con fechas y horas).
  const res = await api.spreadsheets.values.get({ spreadsheetId, range: `'${hoja}'!A1:ZZ`, valueRenderOption: "FORMATTED_VALUE" });
  const [head = [], ...rows] = (res.data.values ?? []) as string[][];
  const H = head.map((h) => normalizeText(String(h)));
  const idx = (re: RegExp, desde = 0) => H.findIndex((h, i) => i >= desde && re.test(h));
  const col = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");

  const I = {
    marca: idx(/marca temporal/),
    detalle: idx(/detalle de la actividad/),
    responsable: idx(/responsable/),
    flyr: idx(/^flyr$|^flyer$/),
    zona: idx(/^zona$/),
    nombre: idx(/nombre de la actividad/),
    fecha: idx(/^fecha programada/),
    hi: idx(/^horario programado$/),
    hf: idx(/horario programado de finalizacion/),
    fechaAlt: idx(/fecha\s+alternativa/),
    horaAlt: idx(/horario alternativo/),
    barrio: idx(/^barrio$/),
    direccion: idx(/calle y altura/),
    entre: idx(/entre que calle/),
    lugar: idx(/lugar especifico/),
    articula: idx(/trabajara en conjunto/),
    mesa: idx(/^seleccionar$/),
    institucion: idx(/nombre de la institucion/),
    publico: idx(/publico dirigido/),
    reqFlyer: idx(/requiere flyer/),
    gazebo: idx(/requiere gazebos/),
    mesas: idx(/requiere mesas/),
    sillas: idx(/requiere sillas/),
    luz: idx(/bajada de luz/),
    sonido: idx(/proyeccion y sonido/),
    otros: idx(/algun otro insumo/),
    link: idx(/link de formulario/),
  };
  const faltantes = Object.entries(I).filter(([, v]) => v < 0).map(([k]) => k);
  if (faltantes.includes("nombre") || faltantes.includes("fecha")) {
    console.error(`✗ La hoja «${hoja}» no tiene las columnas esperadas (faltan: ${faltantes.join(", ")}).`);
    process.exit(1);
  }
  if (faltantes.length) console.log(`• Columnas no encontradas (se ignoran): ${faltantes.join(", ")}`);

  const s = probar ? null : await snapshot({ fresh: true });
  const yaMigradas = new Set((s?.actividades ?? []).map((a) => a.origen));
  const hoy = today();

  // Zona de cada barrio según las filas que sí la tienen (para completar las que no).
  const zonaBarrio = new Map<string, Zona>();
  for (const r of rows) {
    const z = zonaDe(col(r, I.zona));
    const b = normalizeBarrio(col(r, I.barrio));
    if (b && (z === "NORTE" || z === "ESTE" || z === "SUR") && !zonaBarrio.has(b)) zonaBarrio.set(b, z);
  }
  for (const b of s?.barrios ?? []) if (!zonaBarrio.has(b.barrio)) zonaBarrio.set(b.barrio, b.zona);

  type Nueva = NewEntity<"actividades"> & { _fila: number; _institucion: string };
  const nuevas: Nueva[] = [];
  let salteadas = 0;
  rows.forEach((r, n) => {
    const nombre = col(r, I.nombre).replace(/\s+/g, " ");
    if (!nombre) return;
    const marca = col(r, I.marca);
    const origen = `FORM:${marca || `fila-${n + 2}`}:${slugify(nombre).slice(0, 30)}`;
    if (yaMigradas.has(origen)) {
      salteadas++;
      return;
    }
    const fecha = parseFechaFlexible(col(r, I.fecha));
    const barrio = normalizeBarrio(col(r, I.barrio));
    let zona = zonaDe(col(r, I.zona));
    const zonaInferida = !zona && barrio ? zonaBarrio.get(barrio) ?? "" : "";
    if (!zona && zonaInferida) zona = zonaInferida;
    const flyr = normalizeText(col(r, I.flyr));
    const obs: string[] = [];
    let estado: EstadoActividad = fecha && fecha < hoy ? "REALIZADA" : "PROGRAMADA";
    if (/suspend/.test(flyr) || /suspend/i.test(nombre)) estado = "SUSPENDIDA";
    if (/pasa a/i.test(nombre)) {
      estado = "SUSPENDIDA";
      obs.push("Reprogramada (según el formulario anterior).");
    }
    if (estado === "REALIZADA") obs.push("Migrada del formulario anterior: se asume realizada (sin datos de asistencia).");
    if (zonaInferida) obs.push(`Zona completada según el barrio (${zonaInferida}).`);
    if (!zona) obs.push(`Zona original: «${col(r, I.zona) || "vacía"}». Revisar.`);
    const mesa = col(r, I.mesa);
    const inst = col(r, I.institucion);
    const institucion = vacio(inst) || /^plaza$/i.test(inst.trim()) ? "" : titleCase(inst);
    const otros = col(r, I.otros);
    const otrosOk = vacio(otros) ? "" : otros.replace(/\s*\n\s*/g, "; ");
    const sonido = col(r, I.sonido);
    const link = col(r, I.link);
    if (link) obs.push(`Inscripciones (Google): ${link}`);
    const entre = col(r, I.entre);
    const { mes, anio } = fecha ? { mes: Number(fecha.slice(5, 7)), anio: Number(fecha.slice(0, 4)) } : { mes: 0, anio: 0 };
    const q = (i: number) => (i >= 0 ? cantidad(col(r, i + 1)) : 0);

    nuevas.push({
      _fila: n + 2,
      _institucion: institucion,
      marca_temporal: marca || "(sin marca temporal)",
      mes,
      anio,
      nombre: titleCase(nombre).replace(/\s+-\s*Pasa A .*$/i, ""),
      detalle: col(r, I.detalle),
      responsable: titleCase(col(r, I.responsable)),
      zona,
      localidad: "",
      tipo: tipoDe(mesa, nombre),
      publico: col(r, I.publico).toUpperCase(),
      estado,
      fecha,
      hora_inicio: parseHoraFlexible(col(r, I.hi)),
      hora_fin: parseHoraFlexible(col(r, I.hf)),
      fecha_alt: parseFechaFlexible(col(r, I.fechaAlt)),
      hora_alt: parseHoraFlexible(col(r, I.horaAlt)),
      fechas_clases: "",
      barrio,
      direccion: col(r, I.direccion),
      entre_calles: vacio(entre) ? "" : entre.replace(/^entre\s+/i, ""),
      lugar: col(r, I.lugar).replace(/\.$/, ""),
      lat: 0,
      lng: 0,
      articula: si(col(r, I.articula)) || !!institucion,
      tipo_articulacion: mesa ? "MESA INTERNA" : institucion ? "INSTITUCIÓN EXTERNA" : "",
      mesa: mesa.toUpperCase(),
      institucion_id: "",
      institucion_nombre: institucion,
      requiere_flyer: si(col(r, I.reqFlyer)),
      estado_flyer: si(col(r, I.reqFlyer)) ? (/listo/.test(flyr) ? "PUBLICADO" : "SOLICITADO") : "",
      link_flyer: "",
      link_flyer_historia: "",
      link_grupo: "",
      mensaje_confirmacion: "",
      mensaje_grupo: "",
      gazebo: si(col(r, I.gazebo)),
      gazebo_cant: si(col(r, I.gazebo)) ? q(I.gazebo) : 0,
      mesas: si(col(r, I.mesas)),
      mesas_cant: si(col(r, I.mesas)) ? q(I.mesas) : 0,
      sillas: si(col(r, I.sillas)),
      sillas_cant: si(col(r, I.sillas)) ? q(I.sillas) : 0,
      luz: si(col(r, I.luz)),
      sonido: si(sonido),
      otros_insumos: otrosOk,
      costo_estimado: montos(otros),
      costo_real: 0,
      obs_logistica: /solo sonido/i.test(sonido) ? "Solo sonido." : "",
      slug: "",
      link_inscripcion: "",
      inscripcion_abierta: false,
      es_feria: false,
      cupo: 0,
      croquis: "",
      checklist: "",
      preguntas_extra: "",
      inscriptos: 0,
      presentes: 0,
      ausentes: 0,
      pct_asistencia: 0,
      resultados: "",
      incidencias: "",
      fotos: "",
      observaciones: obs.join("\n"),
      origen,
      creado_por: USER,
    });
  });

  nuevas.sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999"));
  console.log(`\n${nuevas.length} actividades para migrar · ${salteadas} ya migradas antes\n`);
  for (const a of nuevas) {
    console.log(
      `  fila ${String(a._fila).padStart(3)} | ${a.fecha || "sin fecha "} ${a.hora_inicio.padEnd(5)} | ${(a.zona || "¿ZONA?").padEnd(7)} | ${a.estado.padEnd(10)} | ${a.barrio.padEnd(22).slice(0, 22)} | ${a.nombre.slice(0, 45)}`,
    );
  }
  if (probar) {
    console.log("\n(Modo prueba: no se escribió nada. Ejecutá sin --probar para migrar.)");
    return;
  }
  if (!nuevas.length) return;

  // Ubicación en el mapa (1 consulta por segundo para respetar el servicio de OpenStreetMap)
  if (!sinMapa) {
    console.log("\nUbicando en el mapa…");
    for (const a of nuevas) {
      if (!a.direccion && !a.barrio) continue;
      const dir = /\d/.test(a.direccion) || !a.entre_calles ? a.direccion : `${a.direccion} y ${a.entre_calles.split(/\s+y\s+/i)[0]}`;
      const u = await geocodificar(dir, a.barrio);
      if (u) {
        a.lat = Math.round(u.lat * 1e6) / 1e6;
        a.lng = Math.round(u.lng * 1e6) / 1e6;
        if (u.aproximado) a.observaciones = [a.observaciones, "Ubicación aproximada: revisar en el mapa."].filter(Boolean).join("\n");
      }
      console.log(`  ${u ? (u.aproximado ? "≈" : "✓") : "✗"} ${a.nombre.slice(0, 40)} ${u ? `(${u.fuente})` : ""}`);
      await sleep(1100);
    }
  }

  // Instituciones externas nuevas
  const instExistentes = new Map((await readFresh("instituciones")).map((i) => [i.nombre.toLowerCase(), i]));
  for (const a of nuevas) {
    if (!a._institucion) continue;
    let inst = instExistentes.get(a._institucion.toLowerCase());
    if (!inst) {
      inst = await insert("instituciones", { nombre: a._institucion, tipo: "", observaciones: "Creada al migrar el formulario anterior." }, USER);
      instExistentes.set(inst.nombre.toLowerCase(), inst);
    }
    a.institucion_id = inst.id;
  }

  // IDs correlativos por año
  const porAnio = new Map<number, Nueva[]>();
  for (const a of nuevas) porAnio.set(a.anio || new Date().getFullYear(), [...(porAnio.get(a.anio || new Date().getFullYear()) ?? []), a]);
  for (const [anio, lista] of porAnio) {
    const ids = await nextSeq("actividades", lista.length, anio);
    lista.forEach((a, i) => (a.id = ids[i]));
  }
  await insertMany(
    "actividades",
    nuevas.map(({ _fila, _institucion, ...a }) => a),
    USER,
    `migración desde «${hoja}»`,
  );
  console.log(`\n✓ ${nuevas.length} actividades migradas a ACTIVIDADES.`);

  // Barrios normalizados
  const barriosActuales = new Set((await snapshot({ fresh: true })).barrios.map((b) => b.barrio));
  let nb = 0;
  for (const [barrio, zona] of zonaBarrio) {
    if (barriosActuales.has(barrio)) continue;
    await upsertBarrio({ barrio, zona, activo: true }, USER);
    nb++;
  }
  if (nb) console.log(`✓ ${nb} barrios agregados a ZONAS_BARRIOS.`);
  const sinZona = nuevas.filter((a) => !a.zona).length;
  if (sinZona) console.log(`• ${sinZona} actividades quedaron sin zona: la app las muestra en «Revisarlas» del inicio.`);
}

main().catch((e) => {
  console.error("✗ Error inesperado:", e);
  process.exit(1);
});
