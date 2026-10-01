"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition, type ReactNode } from "react";
import { IconSearch } from "./icons";
import { cx } from "./ui";

/**
 * Formulario de filtros por URL (GET): al cambiar un desplegable se aplica solo.
 * Así los filtros quedan en el link y se pueden compartir.
 */
export function FiltrosForm({ action, children, className }: { action: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const aplicar = () => {
    const fd = new FormData(ref.current!);
    const p = new URLSearchParams();
    for (const [k, v] of fd) if (typeof v === "string" && v.trim()) p.set(k, v.trim());
    start(() => router.push(`${action}${p.size ? `?${p}` : ""}`));
  };
  return (
    <form
      ref={ref}
      action={action}
      onSubmit={(e) => {
        e.preventDefault();
        aplicar();
      }}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") aplicar();
      }}
      className={cx(className, pending && "opacity-70")}
      aria-busy={pending}
    >
      {children}
    </form>
  );
}

const selCls = "h-11 w-full rounded-xl border border-linea bg-white px-3 text-[15px] text-tinta focus:border-petroleo focus:outline-none";

/** Versión compacta (chip): ocupa solo lo que necesita y se resalta cuando hay un filtro elegido. */
const chipCls =
  "h-10 w-auto max-w-[11.5rem] cursor-pointer truncate appearance-none rounded-full border bg-white bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8 pl-3.5 text-sm font-semibold text-tinta focus:border-petroleo focus:outline-none";
const flecha = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235b6678' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

export function FiltroSelect({ name, value, options, placeholder, label, chip, activo }: {
  name: string;
  value: string | number;
  options: readonly (readonly [string | number, string])[];
  placeholder?: string;
  label: string;
  chip?: boolean;
  activo?: boolean; // chip: resaltar (por defecto, cuando tiene un valor elegido)
}) {
  const resaltado = activo ?? (value !== "" && value !== undefined);
  return (
    <label className={chip ? "inline-block min-w-0" : "block min-w-0"}>
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={String(value)}
        className={chip ? cx(chipCls, resaltado ? "border-petroleo bg-petroleo-50 text-petroleo-600" : "border-linea") : selCls}
        // field-sizing: el chip mide lo que ocupa la opción elegida (no la más larga), donde el navegador lo permite.
        style={chip ? ({ backgroundImage: flecha, fieldSizing: "content" } as React.CSSProperties) : undefined}
        aria-label={label}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Buscador({ name = "q", value, placeholder }: { name?: string; value: string; placeholder: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <IconSearch className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gris" size={20} />
      <input
        type="search"
        name={name}
        defaultValue={value}
        placeholder={placeholder}
        enterKeyHint="search"
        className="h-11 w-full rounded-xl border border-linea bg-white pr-3 pl-10 text-[16px] text-tinta placeholder:text-gris/70 focus:border-petroleo focus:outline-none"
      />
    </label>
  );
}
