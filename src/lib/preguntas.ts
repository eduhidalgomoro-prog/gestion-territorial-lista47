/**
 * Preguntas adicionales de una actividad (una por línea).
 * Si terminan con opciones entre corchetes, se muestran para elegir:
 *   «¿Fuiste alumna de la Escuela de Mujeres Emprendedoras? [Sí / No]»
 */
export interface Pregunta {
  texto: string;
  opciones: string[] | null;
}

export function parsePreguntas(texto: string): Pregunta[] {
  return (texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
      if (!m) return { texto: l, opciones: null };
      const opciones = m[2].split(/[/|]/).map((o) => o.trim()).filter(Boolean);
      return { texto: m[1].trim(), opciones: opciones.length > 1 ? opciones : null };
    });
}

/** Preguntas que se usan en los talleres de ESME (se pueden copiar en la actividad). */
export const PREGUNTAS_ESME = [
  "¿Fuiste alumna de la Escuela de Mujeres Emprendedoras? [Sí / No]",
  "¿Tenés alguna profesión u oficio?",
  "¿Te gustaría enseñarlo? [Sí / No]",
].join("\n");
