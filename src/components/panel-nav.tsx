"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IconCalendar, IconChart, IconClipboard, IconGazebo, IconGear, IconHome, IconImage, IconList, IconLogout, IconMap, IconMore, IconPlus, IconUsers } from "./icons";
import { CargandoLink } from "./cargando-link";
import { InstallButton } from "./install-button";
import { cx, SelloLista47 } from "./ui";

export interface NavPermisos {
  crear: boolean;
  participantes: boolean;
  estadisticas: boolean;
  configurar: boolean;
  flyers: boolean;
  ferias: boolean;
  logistica: boolean;
  inicio: boolean;
}

function items(p: NavPermisos) {
  return [
    { href: "/inicio", label: "Inicio", Icon: IconHome, show: p.inicio },
    { href: "/logistica", label: "Logística", Icon: IconGazebo, show: p.logistica && !p.inicio },
    { href: "/flyers", label: "Flyers", Icon: IconImage, show: p.flyers && !p.inicio },
    { href: "/actividades", label: "Actividades", Icon: IconList, show: true },
    { href: "/calendario", label: "Calendario", Icon: IconCalendar, show: true },
    { href: "/mapa", label: "Mapa", Icon: IconMap, show: true },
    { href: "/ferias", label: "Ferias", Icon: IconGazebo, show: p.ferias },
    { href: "/logistica", label: "Logística", Icon: IconClipboard, show: p.logistica && p.inicio },
    { href: "/participantes", label: "Participantes", Icon: IconUsers, show: p.participantes },
    { href: "/estadisticas", label: "Estadísticas", Icon: IconChart, show: p.estadisticas },
    { href: "/flyers", label: "Flyers", Icon: IconImage, show: p.flyers && p.inicio },
    { href: "/configuracion", label: p.configurar ? "Configuración" : "Mi cuenta", Icon: IconGear, show: true },
  ].filter((i) => i.show);
}

function useActive() {
  const path = usePathname();
  // La pantalla de una feria (/actividades/ACT-…/feria) pertenece al menú Ferias.
  const enFeria = /^\/actividades\/[^/]+\/feria/.test(path);
  return (href: string) =>
    href === "/ferias" ? enFeria || path === href : !(enFeria && href === "/actividades") && (path === href || (path.startsWith(href + "/") && !path.startsWith("/actividades/nueva")));
}

function LogoutButton({ className }: { className?: string }) {
  return (
    <form action="/api/auth/logout" method="post">
      <button type="submit" className={className}>
        <IconLogout size={20} /> Salir
      </button>
    </form>
  );
}

/** Barra lateral (computadora). */
export function Sidebar({ nombre, rol, permisos }: { nombre: string; rol: string; permisos: NavPermisos }) {
  const active = useActive();
  return (
    <aside className="bg-institucional sticky top-0 hidden h-dvh w-64 shrink-0 flex-col text-white lg:flex">
      <Link href="/inicio" className="flex items-center gap-3 px-5 pt-6 pb-5">
        <SelloLista47 size={48} />
        <span className="leading-tight">
          <span className="block text-[11px] font-bold tracking-[0.2em] text-white/75 uppercase">CC ARI · Corrientes</span>
          <span className="font-titulo block text-lg font-extrabold">Gestión Territorial</span>
        </span>
      </Link>
      {permisos.crear && (
        <div className="px-4 pb-4">
          <Link
            href="/actividades/nueva"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-verde font-bold text-white shadow-md transition-colors hover:bg-[#58a53c]"
          >
            <IconPlus size={20} /> Nueva actividad
            <CargandoLink />
          </Link>
        </div>
      )}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Principal">
        {items(permisos).map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors",
              active(href) ? "bg-white text-petroleo" : "text-white/85 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon size={20} />
            {label}
            <CargandoLink />
          </Link>
        ))}
      </nav>
      <div className="space-y-2 border-t border-white/15 px-3 py-4">
        <p className="truncate px-3 text-sm font-semibold" title={nombre}>{nombre}</p>
        <p className="px-3 text-xs text-white/70">{rol}</p>
        <LogoutButton className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-white/85 hover:bg-white/10" />
      </div>
    </aside>
  );
}

/** Encabezado + barra inferior (celular). */
export function MobileNav({ permisos }: { permisos: NavPermisos }) {
  const active = useActive();
  const path = usePathname();
  const [mas, setMas] = useState(false);
  // Al navegar, cerrar el menú (ajuste de estado durante el render, patrón recomendado por React).
  const [ultimaRuta, setUltimaRuta] = useState(path);
  if (ultimaRuta !== path) {
    setUltimaRuta(path);
    setMas(false);
  }

  const todos = items(permisos);
  // 3 accesos directos en la barra (el resto va a «Más»). Diseño no tiene inicio: su pantalla principal es Flyers;
  // la responsable de ferias, Ferias.
  const atajos = !permisos.inicio
    ? permisos.logistica
      ? ["/logistica", "/actividades", "/calendario"]
      : permisos.flyers ? ["/flyers", "/actividades", "/mapa"] : ["/ferias", "/calendario", "/actividades"]
    : ["/inicio", "/actividades", permisos.participantes ? "/participantes" : "/mapa"];
  const principales = atajos.map((h) => todos.find((i) => i.href === h)).filter((i): i is (typeof todos)[number] => !!i);
  const resto = todos.filter((i) => !principales.includes(i));
  const izquierda = principales.slice(0, 2);
  const derecha = principales.slice(2);

  const Tab = ({ href, label, Icon }: (typeof todos)[number]) => (
    <Link
      href={href}
      aria-current={active(href) ? "page" : undefined}
      className={cx("flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active(href) ? "text-petroleo" : "text-gris")}
    >
      <Icon />
      {label}
      <CargandoLink />
    </Link>
  );

  return (
    <>
      <header className="bg-institucional sticky top-0 z-30 flex h-14 items-center gap-2.5 px-4 text-white lg:hidden">
        <SelloLista47 size={34} />
        <span className="font-titulo text-[15px] font-extrabold">Gestión Territorial</span>
      </header>

      {mas && (
        <div className="fixed inset-0 z-40 bg-tinta/40 lg:hidden" onClick={() => setMas(false)}>
          <div
            className="absolute inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] rounded-t-2xl bg-white p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {resto.map(({ href, label, Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-3.5 text-[16px] font-semibold hover:bg-fondo">
                <Icon /> {label}
                <CargandoLink />
              </Link>
            ))}
            <div className="px-1 py-2">
              <InstallButton className="w-full" />
            </div>
            <LogoutButton className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-[16px] text-gris hover:bg-fondo" />
          </div>
        </div>
      )}

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-linea bg-white lg:hidden" aria-label="Principal">
        <div className={cx("grid h-16", permisos.crear ? "grid-cols-5" : "grid-cols-4")}>
          {izquierda.map((i) => (
            <Tab key={i.href} {...i} />
          ))}
          {permisos.crear && (
            <Link href="/actividades/nueva" aria-label="Nueva actividad" className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-marca">
              <span className="-mt-6 flex size-14 items-center justify-center rounded-full bg-verde text-white shadow-lg ring-4 ring-white">
                <IconPlus size={28} />
              </span>
              Nueva
              <CargandoLink />
            </Link>
          )}
          {derecha.map((i) => (
            <Tab key={i.href} {...i} />
          ))}
          <button
            type="button"
            onClick={() => setMas((v) => !v)}
            aria-expanded={mas}
            className={cx("flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", resto.some((r) => active(r.href)) || mas ? "text-petroleo" : "text-gris")}
          >
            <IconMore /> Más
          </button>
        </div>
      </nav>
    </>
  );
}
