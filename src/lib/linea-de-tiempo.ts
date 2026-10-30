import { fechasDeClases } from "./clases";
import type { Snapshot } from "./db";
import { conteosPorActividad, filtrarActividades, type Filtros } from "./domain/metricas";
import { titulo, ubicacionLabel } from "./labels";
import type { Actividad } from "./schema";
import { ambitoDe } from "./territorio";
import { titleCase } from "./util";

/**
 * Línea de tiempo del mes (página y PDF): todas las actividades día por día, con los datos básicos.
 * Como el calendario: sin borradores ni canceladas; los talleres de varias clases aparecen en cada clase.
 */

export const AMBITOS = [
  ["", "Toda la provincia"],
  ["capital", "Capital"],
  ["interior", "Interior"],
] as const;

export interface Encuentro {
  id: string;
  fecha: string;
  hora: string;
  horario: string; // «17:00 a 19:00 h»
  nombre: string;
  clase: string; // «clase 2 de 4» ("" = un solo día)
  detalle: string; // tipo · zona o localidad · lugar · barrio
  responsable: string;
  inscriptos: string; // «49 inscriptos de 50» ("" = sin inscriptos)
  estado: string; // «Suspendida» ("" = programada o confirmada)
}

export function lineaDeTiempo(s: Snapshot, f: Filtros, anio: number, mes: number) {
  const ambito = f.ambito === "capital" || f.ambito === "interior" ? f.ambito : "";
  const prefijo = `${anio}-${String(mes).padStart(2, "0")}`;
  const conteos = conteosPorActividad(s);
  const actividades = filtrarActividades(
    s.actividades.filter((a) => a.estado !== "BORRADOR" && a.estado !== "CANCELADA"),
    { ...f, ambito, anio: 0, mes: 0 },
  );
  const lista = actividades
    .flatMap((a) => {
      const fechas = fechasDeClases(a);
      return fechas.map((fecha, i) => ({ a, fecha, clase: fechas.length > 1 ? `clase ${i + 1} de ${fechas.length}` : "" }));
    })
    .filter((e) => e.fecha.startsWith(prefijo))
    .sort((x, y) => (x.fecha + (x.a.hora_inicio || "99")).localeCompare(y.fecha + (y.a.hora_inicio || "99")) || x.a.nombre.localeCompare(y.a.nombre));

  const encuentro = ({ a, fecha, clase }: { a: Actividad; fecha: string; clase: string }): Encuentro => {
    const inscriptos = conteos.get(a.id)?.inscriptos ?? 0;
    return {
      id: a.id,
      fecha,
      hora: a.hora_inicio,
      horario: a.hora_inicio && a.hora_fin ? `${a.hora_inicio} a ${a.hora_fin} h` : "",
      nombre: a.nombre,
      clase,
      detalle: [
        a.tipo && titulo(a.tipo),
        ubicacionLabel(a),
        [a.lugar, a.direccion].filter(Boolean).join(", "),
        a.barrio && ambitoDe(a.zona) === "capital" && `Barrio ${titleCase(a.barrio)}`,
      ].filter(Boolean).join(" · "),
      responsable: a.responsable ? titleCase(a.responsable) : "",
      inscriptos: inscriptos > 0 ? `${inscriptos} inscriptos${a.cupo ? ` de ${a.cupo}` : ""}` : "",
      estado: a.estado !== "CONFIRMADA" && a.estado !== "PROGRAMADA" ? titulo(a.estado) : "",
    };
  };
  const encuentros = lista.map(encuentro);
  const dias = [...new Set(encuentros.map((e) => e.fecha))].map((fecha) => ({ fecha, encuentros: encuentros.filter((e) => e.fecha === fecha) }));

  const distintas = new Map(lista.map((e) => [e.a.id, e.a]));
  const enCapital = [...distintas.values()].filter((a) => ambitoDe(a.zona) === "capital").length;
  const tipos = new Map<string, number>();
  for (const a of distintas.values()) {
    const t = titulo(a.tipo || "Sin tipo");
    tipos.set(t, (tipos.get(t) ?? 0) + 1);
  }
  const masTipos = [...tipos.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
  const extra = [f.zona && titleCase(f.zona), f.tipo, f.barrio && `Barrio ${titleCase(f.barrio)}`, f.responsable].filter(Boolean).join(" · ");

  return {
    ambito,
    etiquetaAmbito: AMBITOS.find(([id]) => id === ambito)![1] + (extra ? ` · ${extra}` : ""),
    dias,
    resumen: {
      actividades: distintas.size,
      encuentros: encuentros.length,
      dias: dias.length,
      capital: enCapital,
      interior: distintas.size - enCapital,
      tipos: tipos.size,
      porTipo: masTipos.map(([t, n]) => `${t} (${n})`).join(" · ") + (tipos.size > masTipos.length ? " · otros" : ""),
    },
  };
}
