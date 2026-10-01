"use client";

import { useRef, type ReactNode } from "react";

/**
 * Une el calendario con la agenda: al tocar un día (o «+ N actividades») baja suave hasta ese día
 * en la agenda y lo resalta un momento. Tocar una actividad abre su ficha (como siempre).
 * Los días llevan data-dia="N"; la agenda, id="dia-N".
 */
export function NavegarAgenda({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const ir = (dia: string) => {
    const destino = document.getElementById(`dia-${dia}`);
    if (!destino) return;
    destino.scrollIntoView({ behavior: "smooth", block: "start" });
    destino.setAttribute("data-resaltado", "1");
    setTimeout(() => destino.removeAttribute("data-resaltado"), 1800);
  };
  return (
    <div
      ref={ref}
      className={className}
      onClick={(e) => {
        const el = e.target as HTMLElement;
        const salto = el.closest<HTMLElement>("[data-ir-dia]");
        if (salto) {
          e.preventDefault();
          ir(salto.dataset.irDia!);
          return;
        }
        if (el.closest("a")) return; // una actividad: abre su ficha
        const celda = el.closest<HTMLElement>("[data-dia]");
        if (celda) ir(celda.dataset.dia!);
      }}
    >
      {children}
    </div>
  );
}
