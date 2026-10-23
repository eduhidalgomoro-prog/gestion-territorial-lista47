"use client";

/** «Imprimir / guardar PDF»: abre la impresión del navegador (desde ahí se guarda como PDF). */
export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center rounded-xl border border-linea bg-white px-3 text-sm font-bold text-petroleo print:hidden">
      Imprimir / guardar PDF
    </button>
  );
}
