import { normalizeText } from "./format";
import type { Animal, Atencion, Especie } from "./schema";

/**
 * Marcando Huellas: operativos de vacunación antirrábica y desparasitación.
 * No hay inscripción: se registran ATENCIONES (persona responsable) con uno o varios ANIMALES y sus prestaciones.
 * Sirve en el servidor y en el navegador.
 */

/** Una actividad es de Marcando Huellas por su tipo (o, si no tiene tipo, por el nombre). */
export function esMarcandoHuellas(a: { tipo: string; nombre?: string }): boolean {
  const t = normalizeText(a.tipo);
  if (t) return t.includes("marcando huellas");
  return normalizeText(a.nombre ?? "").includes("marcando huellas");
}

export interface AnimalInput {
  especie: Especie;
  castrado: boolean | null; // null = todavía sin responder
  quiere_castrar: boolean | null;
  antirrabica: boolean;
  desparasitacion: boolean;
}

export const MAX_ANIMALES = 20;

/**
 * Deja los animales consistentes antes de guardar: numerados por especie (Perro 1, Perro 2, Gato 1),
 * y el interés en castrar solo cuenta si el animal NO está castrado.
 */
export function normalizarAnimales(lista: AnimalInput[]): (Omit<AnimalInput, "castrado" | "quiere_castrar"> & { castrado: boolean; quiere_castrar: boolean; numero: number })[] {
  const contador: Record<Especie, number> = { PERRO: 0, GATO: 0 };
  return lista
    .filter((a) => a.especie === "PERRO" || a.especie === "GATO")
    .slice(0, MAX_ANIMALES)
    .map((a) => {
      const castrado = a.castrado === true;
      return {
        especie: a.especie,
        numero: ++contador[a.especie],
        castrado,
        quiere_castrar: !castrado && a.quiere_castrar === true,
        antirrabica: !!a.antirrabica,
        desparasitacion: !!a.desparasitacion,
      };
    });
}

/** Lista de animales a partir de «cuántos perros y cuántos gatos», conservando lo ya cargado. */
export function ajustarCantidad(actual: AnimalInput[], especie: Especie, cantidad: number): AnimalInput[] {
  const n = Math.max(0, Math.min(MAX_ANIMALES, cantidad));
  const deEspecie = actual.filter((a) => a.especie === especie);
  const otros = actual.filter((a) => a.especie !== especie);
  const nuevos = Array.from({ length: n }, (_, i) => deEspecie[i] ?? { especie, castrado: null, quiere_castrar: null, antirrabica: true, desparasitacion: true });
  // Perros primero y después gatos (así se numeran y se muestran en orden).
  return especie === "PERRO" ? [...nuevos, ...otros] : [...otros, ...nuevos];
}

export interface ResumenHuellas {
  operativos: number;
  atenciones: number;
  responsables: number; // personas distintas
  animales: number;
  perros: number;
  gatos: number;
  antirrabicas: number;
  desparasitaciones: number;
  castrados: number;
  noCastrados: number;
  interesados: number;
  perrosCastrados: number;
  gatosCastrados: number;
  perrosNoCastrados: number;
  gatosNoCastrados: number;
}

/** Totales de uno o varios operativos (solo atenciones y animales activos). */
export function resumenHuellas(actividadIds: string[], atenciones: Atencion[], animales: Animal[]): ResumenHuellas {
  const ids = new Set(actividadIds);
  const ats = atenciones.filter((a) => a.activo && ids.has(a.actividad_id));
  const atIds = new Set(ats.map((a) => a.id));
  const ans = animales.filter((x) => x.activo && atIds.has(x.atencion_id));
  const cuenta = (f: (x: Animal) => boolean) => ans.filter(f).length;
  return {
    operativos: new Set(ats.map((a) => a.actividad_id)).size,
    atenciones: ats.length,
    responsables: new Set(ats.map((a) => a.participante_id)).size,
    animales: ans.length,
    perros: cuenta((x) => x.especie === "PERRO"),
    gatos: cuenta((x) => x.especie === "GATO"),
    antirrabicas: cuenta((x) => x.antirrabica),
    desparasitaciones: cuenta((x) => x.desparasitacion),
    castrados: cuenta((x) => x.castrado),
    noCastrados: cuenta((x) => !x.castrado),
    interesados: cuenta((x) => !x.castrado && x.quiere_castrar),
    perrosCastrados: cuenta((x) => x.especie === "PERRO" && x.castrado),
    gatosCastrados: cuenta((x) => x.especie === "GATO" && x.castrado),
    perrosNoCastrados: cuenta((x) => x.especie === "PERRO" && !x.castrado),
    gatosNoCastrados: cuenta((x) => x.especie === "GATO" && !x.castrado),
  };
}

/** Atenciones y animales por operativo (para tarjetas y agenda, sin datos personales). */
export function conteosHuellas(atenciones: Atencion[], animales: Animal[]): Map<string, { atenciones: number; animales: number }> {
  const out = new Map<string, { atenciones: number; animales: number }>();
  const activas = new Set<string>();
  for (const a of atenciones) {
    if (!a.activo) continue;
    activas.add(a.id);
    const c = out.get(a.actividad_id) ?? { atenciones: 0, animales: 0 };
    c.atenciones++;
    out.set(a.actividad_id, c);
  }
  for (const x of animales) if (x.activo && activas.has(x.atencion_id)) out.get(x.actividad_id)!.animales++;
  return out;
}

/** «2 perros · 1 gato» */
export function textoAnimales(perros: number, gatos: number): string {
  return [perros && `${perros} ${perros === 1 ? "perro" : "perros"}`, gatos && `${gatos} ${gatos === 1 ? "gato" : "gatos"}`].filter(Boolean).join(" · ") || "Sin animales";
}
