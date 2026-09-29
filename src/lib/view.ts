import "server-only";
import type { Filtros } from "./domain/metricas";
import { mesAnio, today } from "./util";

export type SP = Record<string, string | string[] | undefined>;

/** Lee un parámetro de la URL como texto. */
export function sp(q: SP, k: string): string {
  const v = q[k];
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

/** Período del filtro: por defecto, el mes actual. mes=0 → todo el año. */
export function periodo(q: SP): { anio: number; mes: number } {
  const hoy = mesAnio(today());
  const anio = Number(sp(q, "anio")) || hoy.anio;
  const mesRaw = sp(q, "mes");
  const mes = mesRaw === "" ? hoy.mes : Number(mesRaw);
  return { anio: anio >= 2020 && anio <= 2100 ? anio : hoy.anio, mes: Number.isInteger(mes) && mes >= 0 && mes <= 12 ? mes : hoy.mes };
}

export function filtrosDe(q: SP): Filtros {
  const { anio, mes } = periodo(q);
  return {
    anio,
    mes,
    zona: sp(q, "zona"),
    barrio: sp(q, "barrio"),
    responsable: sp(q, "responsable"),
    tipo: sp(q, "tipo"),
    estado: sp(q, "estado"),
    q: sp(q, "q"),
  };
}

/** Arma una query string conservando filtros (sin vacíos). */
export function qs(base: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v !== undefined && v !== "" && v !== null) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
