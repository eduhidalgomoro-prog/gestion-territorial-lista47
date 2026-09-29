"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { IconCheck, IconUpload } from "@/components/icons";
import { btn, cx } from "@/components/ui";
import { normalizeText } from "@/lib/format";
import type { FilaImportada, VistaPrevia } from "@/lib/services/inscripciones";
import { importarAction, vistaPreviaAction } from "../../../actions";

type Campo = "nombre" | "apellido" | "completo" | "dni" | "telefono" | "barrio" | "fecha";

const CAMPOS: { id: Campo; label: string; hint?: string }[] = [
  { id: "nombre", label: "Nombre" },
  { id: "apellido", label: "Apellido" },
  { id: "completo", label: "Nombre y apellido juntos", hint: "Solo si el formulario los pedía en una sola pregunta." },
  { id: "dni", label: "DNI" },
  { id: "telefono", label: "Teléfono" },
  { id: "barrio", label: "Barrio" },
  { id: "fecha", label: "Fecha de inscripción", hint: "La «Marca temporal» de Google Forms." },
];

/** Reconoce las columnas típicas de un Google Forms. */
function detectar(headers: string[]): Record<Campo, number> {
  const h = headers.map((x) => normalizeText(x));
  const find = (fn: (s: string) => boolean) => h.findIndex(fn);
  const completo = find((s) => /(nombre y apellido|apellido y nombre|nombre completo|apellido\s*,?\s*nombre)/.test(s));
  return {
    completo,
    nombre: find((s) =>/\bnombres?\b/.test(s) && !/apellido|actividad|taller|institucion|responsable/.test(s)),
    apellido: find((s) => /apellidos?/.test(s) && !/nombre/.test(s)),
    dni: find((s) => /\bdni\b|documento|d\.n\.i/.test(s)),
    telefono: find((s) => /tel|cel|whats|movil|contacto/.test(s)),
    barrio: find((s) => /barrio/.test(s)),
    fecha: find((s) => /marca temporal|timestamp|fecha/.test(s)),
  };
}

function partirNombre(completo: string, apellidoPrimero: boolean): { nombre: string; apellido: string } {
  const s = completo.trim().replace(/\s+/g, " ");
  if (s.includes(",")) {
    const [ap, ...nom] = s.split(",");
    return { apellido: ap.trim(), nombre: nom.join(" ").trim() };
  }
  const partes = s.split(" ");
  if (partes.length === 1) return { nombre: s, apellido: "" };
  return apellidoPrimero
    ? { apellido: partes[0], nombre: partes.slice(1).join(" ") }
    : { nombre: partes.slice(0, -1).join(" "), apellido: partes[partes.length - 1] };
}

export function Importador({ actividadId }: { actividadId: string }) {
  const [archivo, setArchivo] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [filas, setFilas] = useState<unknown[][]>([]);
  const [map, setMap] = useState<Record<Campo, number>>({ nombre: -1, apellido: -1, completo: -1, dni: -1, telefono: -1, barrio: -1, fecha: -1 });
  const [previa, setPrevia] = useState<VistaPrevia | null>(null);
  const [resultado, setResultado] = useState<{ importadas: number; personasNuevas: number; inscripcionesNuevas: number; yaInscriptos: number; conErrores: number } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  async function leer(file: File) {
    setError("");
    setPrevia(null);
    setResultado(null);
    try {
      let rows: unknown[][];
      if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
        const Papa = (await import("papaparse")).default;
        const text = await file.text();
        rows = Papa.parse<unknown[]>(text, { skipEmptyLines: "greedy" }).data;
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // raw: las fechas llegan como número de serie de Excel (sin ambigüedad día/mes).
        rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: false });
      }
      const [head = [], ...body] = rows;
      const hs = head.map((x) => String(x ?? "").trim());
      if (!hs.length || !body.length) throw new Error("vacío");
      setArchivo(file.name);
      setHeaders(hs);
      setFilas(body.filter((r) => r.some((c) => String(c ?? "").trim())));
      setMap(detectar(hs));
    } catch {
      setError("No pudimos leer el archivo. Tiene que ser Excel (.xlsx) o CSV, con los títulos de las columnas en la primera fila.");
    }
  }

  function convertir(): FilaImportada[] {
    const col = (r: unknown[], c: Campo) => (map[c] >= 0 ? String(r[map[c]] ?? "").trim() : "");
    const apellidoPrimero = map.completo >= 0 && /apellido\s*(y|,)\s*nombre/.test(normalizeText(headers[map.completo] ?? ""));
    return filas.map((r) => {
      let nombre = col(r, "nombre");
      let apellido = col(r, "apellido");
      if ((!nombre || !apellido) && map.completo >= 0) {
        const p = partirNombre(col(r, "completo"), apellidoPrimero);
        nombre ||= p.nombre;
        apellido ||= p.apellido;
      }
      return { nombre, apellido, dni: col(r, "dni"), telefono: col(r, "telefono"), barrio: col(r, "barrio"), fecha: col(r, "fecha") };
    });
  }

  const faltanMinimos = map.dni < 0 || (map.nombre < 0 && map.completo < 0) || (map.apellido < 0 && map.completo < 0);

  function verificar() {
    setError("");
    start(async () => {
      const r = await vistaPreviaAction(actividadId, convertir());
      if (r.ok && r.data) setPrevia(r.data);
      else setError(r.message ?? "No se pudo verificar el archivo.");
    });
  }

  function confirmar() {
    setError("");
    start(async () => {
      const r = await importarAction(actividadId, convertir());
      if (r.ok && r.data) setResultado(r.data as typeof resultado);
      else setError(r.message ?? "No se pudo importar.");
    });
  }

  if (resultado) {
    return (
      <div className="rounded-2xl border border-verde bg-white p-6 text-center">
        <p className="font-titulo text-2xl font-extrabold text-marca">¡Importación terminada!</p>
        <ul className="mx-auto mt-4 max-w-sm space-y-1 text-left text-[15px]">
          <li>✓ <b>{resultado.inscripcionesNuevas}</b> inscripciones nuevas en la actividad</li>
          <li>✓ <b>{resultado.personasNuevas}</b> personas nuevas en la base</li>
          {resultado.yaInscriptos > 0 && <li>• {resultado.yaInscriptos} ya estaban inscriptas (no se duplicaron)</li>}
          {resultado.conErrores > 0 && <li className="text-alerta">• {resultado.conErrores} filas no se importaron por datos incompletos</li>}
        </ul>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href={`/actividades/${actividadId}/inscriptos`} className={btn("primario")}>Ver inscriptos</Link>
          <Link href={`/actividades/${actividadId}`} className={btn("secundario")}>Volver a la actividad</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Paso n={1} titulo="Elegí el archivo">
        <p className="mb-3 text-[15px] text-gris">
          En la planilla de respuestas del Google Forms: <b>Archivo → Descargar → Microsoft Excel (.xlsx)</b> o <b>CSV</b>.
        </p>
        <label className={cx(btn("petroleo", "lg"), "w-full cursor-pointer sm:w-auto")}>
          <IconUpload /> {archivo ? "Elegir otro archivo" : "Seleccionar Excel o CSV"}
          <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="sr-only" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
        </label>
        {archivo && <p className="mt-2 text-sm font-semibold">{archivo} · {filas.length} filas</p>}
      </Paso>

      {headers.length > 0 && (
        <Paso n={2} titulo="Relacioná las columnas">
          <p className="mb-3 text-[15px] text-gris">Las reconocimos automáticamente. Revisá que cada dato apunte a la columna correcta.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS.map((c) => (
              <label key={c.id} className="block">
                <span className="mb-1 block text-sm font-bold">{c.label}</span>
                <select
                  value={map[c.id]}
                  onChange={(e) => {
                    setMap((m) => ({ ...m, [c.id]: Number(e.target.value) }));
                    setPrevia(null);
                  }}
                  className="h-11 w-full rounded-xl border border-linea bg-white px-3 text-[15px]"
                >
                  <option value={-1}>— No está en el archivo —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>
                  ))}
                </select>
                {c.hint && <span className="mt-0.5 block text-xs text-gris">{c.hint}</span>}
              </label>
            ))}
          </div>
          {faltanMinimos && <p className="mt-3 text-sm font-semibold text-alerta">Como mínimo hacen falta nombre, apellido y DNI.</p>}

          <p className="mt-4 mb-2 text-sm font-bold">Vista previa</p>
          <div className="overflow-x-auto rounded-xl border border-linea">
            <table className="w-full text-left text-sm">
              <thead className="bg-fondo text-xs text-gris uppercase">
                <tr>{["Nombre", "Apellido", "DNI", "Teléfono", "Barrio"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {convertir().slice(0, 5).map((f, i) => (
                  <tr key={i} className="border-t border-linea">
                    <td className="px-3 py-2">{f.nombre}</td>
                    <td className="px-3 py-2">{f.apellido}</td>
                    <td className="px-3 py-2">{f.dni}</td>
                    <td className="px-3 py-2">{f.telefono}</td>
                    <td className="px-3 py-2">{f.barrio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={verificar} disabled={pending || faltanMinimos} className={cx(btn("primario", "lg"), "mt-4 w-full sm:w-auto")}>
            {pending && !previa ? "Revisando…" : "Detectar duplicados"}
          </button>
        </Paso>
      )}

      {previa && (
        <Paso n={3} titulo="Confirmá la importación">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Num n={previa.total} label="registros encontrados" />
            <Num n={previa.nuevos} label="participantes nuevos" tono="verde" />
            <Num n={previa.existentes} label="ya existentes" />
            <Num n={previa.errores.length} label="con datos incompletos" tono={previa.errores.length ? "alerta" : undefined} />
          </div>
          <ul className="mt-3 space-y-1 text-sm text-gris">
            {previa.yaInscriptos > 0 && <li>• {previa.yaInscriptos} ya estaban inscriptos en esta actividad: no se duplican.</li>}
            {previa.repetidosEnArchivo > 0 && <li>• {previa.repetidosEnArchivo} filas repiten un DNI del mismo archivo: se cuentan una sola vez.</li>}
            {previa.alertasTelefono > 0 && <li className="text-alerta">• {previa.alertasTelefono} personas nuevas tienen un teléfono que ya usa otra persona: quedan marcadas como «posible duplicado» para revisar.</li>}
            <li>• Las personas ya existentes se reconocen por DNI y no se modifican sus datos (solo se completan los vacíos).</li>
          </ul>
          {previa.errores.length > 0 && (
            <details className="mt-3 rounded-xl bg-alerta-50 p-3 text-sm">
              <summary className="cursor-pointer font-bold text-alerta">Ver filas que no se van a importar</summary>
              <ul className="mt-2 space-y-0.5">
                {previa.errores.map((e) => <li key={e.fila}>Fila {e.fila}: {e.motivo}</li>)}
              </ul>
            </details>
          )}
          <button type="button" onClick={confirmar} disabled={pending || previa.validas === 0} className={cx(btn("primario", "lg"), "mt-4 w-full sm:w-auto")}>
            <IconCheck /> {pending ? "Importando…" : `Confirmar importación (${previa.validas - previa.repetidosEnArchivo})`}
          </button>
        </Paso>
      )}

      {error && <p role="alert" className="rounded-xl bg-peligro-50 px-4 py-3 text-[15px] text-peligro">{error}</p>}
    </div>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-linea bg-white p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <span className="flex size-7 items-center justify-center rounded-full bg-petroleo text-sm text-white">{n}</span> {titulo}
      </h2>
      {children}
    </section>
  );
}

function Num({ n, label, tono }: { n: number; label: string; tono?: "verde" | "alerta" }) {
  return (
    <div className={cx("rounded-xl p-3 text-center", tono === "verde" ? "bg-verde-50 text-marca-600" : tono === "alerta" ? "bg-alerta-50 text-alerta" : "bg-fondo")}>
      <p className="font-titulo text-2xl leading-none font-extrabold">{n}</p>
      <p className="mt-1 text-xs font-bold">{label}</p>
    </div>
  );
}
