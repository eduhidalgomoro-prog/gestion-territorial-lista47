import { describe, expect, it } from "vitest";
import { claseDe, nombreCorto } from "../src/lib/taller-nombre";

describe("nombre del taller en pantallas operativas", () => {
  const largo = "Taller De Barbería, Consiste En Cuatro Clases (Viernes 2,9,16 Y 23 De Octubre De 18 A 20 Hs)";

  it("acorta el nombre sin inventar", () => {
    expect(nombreCorto(largo)).toBe("Taller de Barbería");
    expect(nombreCorto("Catering para Eventos: Edición Dulces")).toBe("Catering para Eventos: Edición Dulces");
    expect(nombreCorto("ESME")).toBe("ESME");
  });

  it("detecta la clase solo con datos suficientes", () => {
    expect(claseDe("Taller De Barbería, Cuatro Clases (Viernes 2,9,16 Y 23 De Octubre)", "2026-10-09")).toEqual({ n: 2, total: 4 });
    expect(claseDe("Costura · Clase 3 de 5", "")).toEqual({ n: 3, total: 5 });
    expect(claseDe(largo, "2026-10-02")).toEqual({ n: 1, total: 4 }); // el horario («18 A 20») no se confunde con días
    expect(claseDe("Taller, Cuatro Clases (Viernes 2 y 9 de 18 a 20)", "2026-10-02")).toBeNull(); // no coinciden 4 días
    expect(claseDe("Taller de Fieltro", "2026-10-07")).toBeNull();
    expect(claseDe("Taller, Cuatro Clases (Viernes 2,9,16 Y 23 de octubre)", "2026-10-05")).toBeNull(); // la fecha no es uno de los días
  });
});
