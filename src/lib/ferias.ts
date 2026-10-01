import { normalizeText } from "./format";
import type { TipoPuesto } from "./schema";

/**
 * Ferias de emprendedoras: reglas de puestos y asignación (sin acceso a datos, sirve en el navegador y en el servidor).
 * - INDIVIDUAL: gazebo de la organización para 1 feriante.
 * - COMPARTIDO: gazebo de la organización para 2 feriantes.
 * - PROPIO: lugar para quien trae su gazebo.
 */

export const CAPACIDAD: Record<TipoPuesto, number> = { INDIVIDUAL: 1, COMPARTIDO: 2, PROPIO: 1 };

export const TIPO_PUESTO_LABEL: Record<TipoPuesto, string> = {
  INDIVIDUAL: "Gazebo individual",
  COMPARTIDO: "Gazebo compartido",
  PROPIO: "Con gazebo propio",
};

export const TIPO_PUESTO_HEX: Record<TipoPuesto, string> = {
  INDIVIDUAL: "#106985",
  COMPARTIDO: "#7a4fb0",
  PROPIO: "#c77a0a",
};

/** Opciones de «Puedo llevar a la feria». */
export const LLEVA_OPCIONES = ["Gazebo propio", "Mesa", "Sillas", "Mantel o exhibidor", "Alargue"];

export const llevaGazebo = (lleva: string) => /gaz|gac/i.test(lleva);

export interface FerianteAsignable {
  id: string;
  nombre: string; // nombre y apellido
  emprendimiento: string;
  rubro: string;
  lleva: string;
  al_lado_de: string;
  comparte: boolean;
  puesto: number;
}

export interface PuestoAsignable {
  numero: number;
  tipo: TipoPuesto;
}

/** ¿A quién nombró en «quiere estar al lado de»? (por nombre completo, apellido o emprendimiento). */
export function buscarVecina(f: FerianteAsignable, todas: FerianteAsignable[]): FerianteAsignable | undefined {
  const deseo = normalizeText(f.al_lado_de);
  if (deseo.length < 3) return undefined;
  return todas.find((o) => {
    if (o.id === f.id) return false;
    const nom = normalizeText(o.nombre);
    const emp = normalizeText(o.emprendimiento);
    const partes = nom.split(" ").filter((p) => p.length > 2);
    return (
      (nom && deseo.includes(nom)) ||
      (emp.length > 2 && deseo.includes(emp)) ||
      (partes.length >= 2 && partes.filter((p) => deseo.includes(p)).length >= 2)
    );
  });
}

/**
 * Propone puestos para las feriantes que todavía no tienen (respeta las que ya están asignadas).
 * Orden: el de la lista (quien se inscribió primero elige primero).
 * - Si trae gazebo → puesto PROPIO (si no quedan, individual o compartido).
 * - Si puede compartir → COMPARTIDO (primero completa los que tienen 1, evitando el mismo rubro; si no quedan, individual).
 * - Si no comparte → INDIVIDUAL.
 * - Si pidió estar al lado de alguien que puede compartir, comparten el gazebo; si no, el número más cercano.
 */
export function proponerAsignacion(feriantes: FerianteAsignable[], puestos: PuestoAsignable[]): Map<string, number> {
  const tipoDe = new Map(puestos.map((p) => [p.numero, p.tipo]));
  const ocupacion = new Map<number, FerianteAsignable[]>();
  for (const f of feriantes) if (f.puesto && tipoDe.has(f.puesto)) ocupacion.set(f.puesto, [...(ocupacion.get(f.puesto) ?? []), f]);
  const libre = (n: number) => (ocupacion.get(n)?.length ?? 0) < CAPACIDAD[tipoDe.get(n)!];
  const asignar = (f: FerianteAsignable, n: number) => {
    ocupacion.set(n, [...(ocupacion.get(n) ?? []), f]);
    f.puesto = n;
    out.set(f.id, n);
  };
  const out = new Map<string, number>();
  const lista = feriantes.map((f) => ({ ...f }));
  const porId = new Map(lista.map((f) => [f.id, f]));
  const ordenados = [...puestos].sort((a, b) => a.numero - b.numero);

  const elegir = (f: FerianteAsignable, tipos: TipoPuesto[], cerca?: number): number | undefined => {
    for (const t of tipos) {
      let candidatos = ordenados.filter((p) => p.tipo === t && libre(p.numero));
      if (t === "COMPARTIDO") {
        // Primero los compartidos que ya tienen a alguien (de otro rubro), así no quedan gazebos a medio llenar.
        const conUna = candidatos.filter((p) => (ocupacion.get(p.numero)?.length ?? 0) === 1);
        const otroRubro = conUna.filter((p) => normalizeText(ocupacion.get(p.numero)![0].rubro) !== normalizeText(f.rubro) || !f.rubro);
        candidatos = [...otroRubro, ...conUna.filter((p) => !otroRubro.includes(p)), ...candidatos.filter((p) => !conUna.includes(p))];
      }
      if (cerca) candidatos = [...candidatos].sort((a, b) => Math.abs(a.numero - cerca) - Math.abs(b.numero - cerca));
      if (candidatos.length) return candidatos[0].numero;
    }
    return undefined;
  };
  const tiposPara = (f: FerianteAsignable): TipoPuesto[] =>
    llevaGazebo(f.lleva) ? ["PROPIO", "INDIVIDUAL", ...(f.comparte ? (["COMPARTIDO"] as const) : [])] : f.comparte ? ["COMPARTIDO", "INDIVIDUAL"] : ["INDIVIDUAL"];

  // 1) Parejas que quieren estar juntas y pueden compartir: mismo gazebo compartido.
  for (const f of lista) {
    if (f.puesto || !f.comparte || llevaGazebo(f.lleva)) continue;
    const v = buscarVecina(f, lista);
    const vecina = v && porId.get(v.id);
    if (!vecina || !vecina.comparte || llevaGazebo(vecina.lleva)) continue;
    if (vecina.puesto && tipoDe.get(vecina.puesto) === "COMPARTIDO" && libre(vecina.puesto)) asignar(f, vecina.puesto);
    else if (!vecina.puesto) {
      const n = ordenados.find((p) => p.tipo === "COMPARTIDO" && !(ocupacion.get(p.numero)?.length))?.numero;
      if (n) {
        asignar(f, n);
        asignar(vecina, n);
      }
    }
  }
  // 2) El resto, en orden de inscripción.
  for (const f of lista) {
    if (f.puesto) continue;
    const v = buscarVecina(f, lista);
    const n = elegir(f, tiposPara(f), v ? porId.get(v.id)?.puesto || undefined : undefined);
    if (n) asignar(f, n);
  }
  return out;
}

export const TIPO_PUESTO_FONDO: Record<TipoPuesto, string> = {
  INDIVIDUAL: "#dbe9f7",
  COMPARTIDO: "#e6def3",
  PROPIO: "#fbe9b7",
};

export interface FilaCroquis<P extends PuestoAsignable> {
  sector: string; // A, B, C…
  tipo: TipoPuesto;
  puestos: P[];
}

/** Un sector de la feria: una fila del croquis con gazebos del mismo tipo. */
export interface SectorFeria {
  tipo: TipoPuesto;
  cantidad: number;
}

export const SECTORES_INICIALES: SectorFeria[] = [
  { tipo: "INDIVIDUAL", cantidad: 15 },
  { tipo: "COMPARTIDO", cantidad: 9 },
  { tipo: "COMPARTIDO", cantidad: 8 },
  { tipo: "PROPIO", cantidad: 10 },
];

export const letraSector = (i: number) => String.fromCharCode(65 + (i % 26));

/** Sectores actuales a partir de los puestos (para editarlos). */
export function sectoresDe(puestos: (PuestoAsignable & { sector?: string })[]): SectorFeria[] {
  const out: (SectorFeria & { s: string })[] = [];
  for (const p of [...puestos].sort((a, b) => a.numero - b.numero)) {
    const ult = out[out.length - 1];
    if (ult && (p.sector ? ult.s === p.sector : ult.tipo === p.tipo)) ult.cantidad++;
    else out.push({ s: p.sector ?? "", tipo: p.tipo, cantidad: 1 });
  }
  return out.map(({ tipo, cantidad }) => ({ tipo, cantidad }));
}

/**
 * Croquis automático: una fila por sector (A, B, C…), en orden de número.
 * Si los puestos no tienen sector (ferias viejas), se agrupan por tipo y los grupos largos se parten en filas de hasta `maxPorFila`.
 */
export function armarFilas<P extends PuestoAsignable & { sector?: string }>(puestos: P[], maxPorFila = 16): FilaCroquis<P>[] {
  const ordenados = [...puestos].sort((a, b) => a.numero - b.numero);
  if (ordenados.length && ordenados.every((p) => p.sector)) {
    const filas: FilaCroquis<P>[] = [];
    for (const p of ordenados) {
      const f = filas[filas.length - 1];
      if (f && f.sector === p.sector) f.puestos.push(p);
      else filas.push({ sector: p.sector!, tipo: p.tipo, puestos: [p] });
    }
    return filas;
  }
  const grupos: P[][] = [];
  for (const p of ordenados) {
    const g = grupos[grupos.length - 1];
    if (g && g[0].tipo === p.tipo) g.push(p);
    else grupos.push([p]);
  }
  const filas: FilaCroquis<P>[] = [];
  for (const g of grupos) {
    const n = Math.ceil(g.length / maxPorFila);
    const tam = Math.ceil(g.length / n);
    for (let i = 0; i < g.length; i += tam) {
      filas.push({ sector: String.fromCharCode(65 + (filas.length % 26)), tipo: g[0].tipo, puestos: g.slice(i, i + tam) });
    }
  }
  return filas;
}

/** Texto del puesto para el mensaje: «N° 12 (gazebo compartido con Ana Pérez)». */
export function describirPuesto(numero: number, tipo: TipoPuesto | undefined, compañeras: string[] = []): string {
  if (!numero) return "sin asignar";
  const t = tipo === "COMPARTIDO" ? `gazebo compartido${compañeras.length ? ` con ${compañeras.join(" y ")}` : ""}` : tipo === "PROPIO" ? "con tu gazebo" : tipo === "INDIVIDUAL" ? "gazebo individual" : "";
  return `N° ${numero}${t ? ` (${t})` : ""}`;
}
