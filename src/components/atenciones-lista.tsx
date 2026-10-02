"use client";

import Link from "next/link";
import { useState } from "react";
import { textoAnimales } from "@/lib/huellas";
import { IconGato, IconPerro, IconSearch } from "./icons";

export interface FilaAtencion {
  id: string;
  nombre: string;
  buscar: string; // nombre, apellido, DNI y teléfono (solo para buscar; no se muestran)
  perros: number;
  gatos: number;
  hora: string;
}

/** Listado de atenciones con buscador (nombre, apellido, DNI o teléfono). DNI y teléfono no se muestran en la lista. */
export function AtencionesLista({ actividadId, filas }: { actividadId: string; filas: FilaAtencion[] }) {
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const digitos = q.replace(/\D/g, "");
  const lista = filas.filter((f) => !t || f.buscar.includes(t) || (digitos.length >= 3 && f.buscar.includes(digitos)));
  return (
    <div>
      <label className="relative mb-3 block">
        <span className="sr-only">Buscar</span>
        <IconSearch className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-gris" size={20} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, DNI o teléfono"
          className="h-14 w-full rounded-2xl border-2 border-linea bg-white pr-4 pl-12 text-[16px] focus:border-marca focus:outline-none"
        />
      </label>
      {lista.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-6 text-center text-gris ring-1 ring-linea">{filas.length ? "Nadie coincide con la búsqueda." : "Todavía no hay atenciones registradas."}</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((f) => (
            <li key={f.id}>
              <Link href={`/actividades/${actividadId}/atenciones/${f.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-linea hover:ring-marca">
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-bold">{f.nombre}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[15px] text-gris">
                    {f.perros > 0 && <span className="inline-flex items-center gap-1"><IconPerro size={18} className="text-marca" /> {textoAnimales(f.perros, 0)}</span>}
                    {f.gatos > 0 && <span className="inline-flex items-center gap-1"><IconGato size={18} className="text-marca" /> {textoAnimales(0, f.gatos)}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-gris">{f.hora}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
