"use client";

import { useLinkStatus } from "next/link";

/**
 * Barrita fina arriba de todo mientras se abre la sección que se tocó.
 * La pantalla actual queda visible hasta que llega la nueva (sin parpadeo en blanco).
 * Va dentro de un <Link>. Si la sección llega enseguida, ni se llega a ver (aparece con una pequeña demora).
 */
export function CargandoLink() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden">
      <span className="barra-carga block h-full bg-verde" />
    </span>
  );
}
