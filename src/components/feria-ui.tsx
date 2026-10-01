import Link from "next/link";
import type { ReactNode, SVGProps } from "react";
import { normalizeText } from "@/lib/format";
import { IconArrowLeft } from "./icons";
import { cx } from "./ui";

/**
 * Identidad visual del módulo Feria (ferias de emprendedoras ESME / Lista 47):
 * degradado verde → violeta → fucsia, títulos grandes y los íconos de los rubros.
 * Los colores salen de globals.css (.tema-feria y .feria-degradado).
 */

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 24, ...p }: P) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p,
});

/** Stand / gazebo. */
export const IconStand = (p: P) => (<svg {...base(p)}><path d="M3 9 12 4l9 5H3z" /><path d="M3 9c1.5 1.6 3 1.6 4.5 0 1.5 1.6 3 1.6 4.5 0 1.5 1.6 3 1.6 4.5 0 1.5 1.6 3 1.6 4.5 0" /><path d="M5 11v9M19 11v9M8 20v-5h8v5" /></svg>);
/** Gastronomía. */
export const IconGastronomia = (p: P) => (<svg {...base(p)}><path d="M4 13h16a8 8 0 0 1-16 0z" /><path d="M2.5 13h19M9 4c-1 1.2 1 2.3 0 3.5M13 4c-1 1.2 1 2.3 0 3.5" /><path d="M8 20.5h8" /></svg>);
/** Artesanías. */
export const IconArtesania = (p: P) => (<svg {...base(p)}><path d="M7 21c3-1 3.5-4 3.5-4L19 8.5a2.1 2.1 0 0 0-3-3L7.5 14S4.5 14.5 3.5 17.5C2.6 20 5 21.6 7 21z" /><path d="m14.5 7 2.5 2.5" /></svg>);
/** Bazar / deco. */
export const IconBazar = (p: P) => (<svg {...base(p)}><path d="M9 3h6M10 3v3c-3 1.2-5 4-5 7.5 0 4 3 7.5 7 7.5s7-3.5 7-7.5C19 10 17 7.2 14 6V3" /><path d="M6 13h12" /></svg>);
/** Textil / indumentaria. */
export const IconTextil = (p: P) => (<svg {...base(p)}><path d="M8 3 3.5 6l2 4L7 9.2V21h10V9.2l1.5.8 2-4L16 3c-.6 1.6-2.1 2.5-4 2.5S8.6 4.6 8 3z" /></svg>);
/** Cosmética / bijouterie. */
export const IconBijou = (p: P) => (<svg {...base(p)}><path d="M6 4h12l3 5-9 11L3 9z" /><path d="M3 9h18M9 4l3 16 3-16" /></svg>);
/** Espectáculos. */
export const IconEspectaculo = (p: P) => (<svg {...base(p)}><rect x="9" y="2.5" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></svg>);
/** Sorteos. */
export const IconSorteo = (p: P) => (<svg {...base(p)}><rect x="3.5" y="9" width="17" height="11.5" rx="1.5" /><path d="M2.5 9h19v-3h-19zM12 6v14.5M12 6c-1-3-5.5-3.5-5.5-1S10 6 12 6c2 0 5.5 0 5.5-1S13 3 12 6" /></svg>);

const RUBROS: { claves: string[]; label: string; Icon: (p: P) => ReactNode }[] = [
  { claves: ["gastr", "comida", "dulce", "pasteler", "panader", "cocina", "chocolat", "bebida", "torta", "salad", "conserv"], label: "Gastronomía", Icon: IconGastronomia },
  { claves: ["textil", "indument", "ropa", "moda", "tejid", "lencer", "calzad", "pilch", "crochet"], label: "Textil", Icon: IconTextil },
  { claves: ["bijou", "cosmet", "maquill", "joya", "accesor", "unas", "nails", "belleza", "perfum", "aroma", "jabon"], label: "Bijou y cosmética", Icon: IconBijou },
  { claves: ["artesan", "manual", "madera", "ceramic", "cuero", "pintur", "reciclad"], label: "Artesanías", Icon: IconArtesania },
  { claves: ["bazar", "deco", "hogar", "vela", "sahum", "planta", "macet"], label: "Bazar y deco", Icon: IconBazar },
];

/** Ícono según el rubro que escribió la feriante (si no se reconoce, un stand). */
export function IconoRubro({ rubro, size = 20, className }: { rubro: string; size?: number; className?: string }) {
  const r = normalizeText(rubro);
  const m = RUBROS.find((x) => x.claves.some((c) => r.includes(c)));
  const I = m?.Icon ?? IconStand;
  return <I size={size} className={className} />;
}

const ICONOS_HERO = [IconStand, IconGastronomia, IconArtesania, IconBazar, IconTextil, IconEspectaculo, IconSorteo];

/** Fila de íconos de la feria (decorativa). */
export function IconosFeria({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <div className={cx("flex flex-wrap gap-2", className)} aria-hidden>
      {ICONOS_HERO.map((I, i) => (
        <span key={i} className="flex size-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-sm">
          <I size={size} />
        </span>
      ))}
    </div>
  );
}

/** Formas curvas de fondo (como los flyers): círculos y ondas en blanco translúcido. */
function Decoracion() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" aria-hidden>
      <circle cx="360" cy="20" r="70" fill="#fff" opacity=".10" />
      <circle cx="300" cy="190" r="45" fill="#8cc63f" opacity=".35" />
      <circle cx="395" cy="140" r="28" fill="#fff" opacity=".12" />
      <path d="M0 175c60-30 120 25 190 0s130-35 210-5v30H0z" fill="#fff" opacity=".08" />
      <path d="M210 0c25 40 85 40 110 10" stroke="#fff" strokeWidth="6" fill="none" opacity=".15" strokeLinecap="round" />
    </svg>
  );
}

export interface DatoHero {
  label: string;
  valor: ReactNode;
}

/**
 * Encabezado del módulo Feria: bloque con degradado, título grande y los datos clave
 * (fecha, horario, lugar, stands).
 */
export function FeriaHero({ titulo = "FERIA", subtitulo, datos = [], volver, accion, iconos = true }: {
  titulo?: string;
  subtitulo?: ReactNode;
  datos?: DatoHero[];
  volver?: { href: string; label: string };
  accion?: ReactNode;
  iconos?: boolean;
}) {
  return (
    <header className="feria-degradado relative mb-5 overflow-hidden rounded-[28px] px-5 pt-5 pb-6 text-white shadow-lg sm:px-8 sm:pt-6 sm:pb-8">
      <Decoracion />
      <div className="relative">
        {volver && (
          <Link href={volver.href} className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold ring-1 ring-white/30 hover:bg-white/25">
            <IconArrowLeft size={16} /> {volver.label}
          </Link>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-titulo text-[44px] leading-[0.9] font-black tracking-tight uppercase italic drop-shadow-sm sm:text-6xl">{titulo}</p>
            {subtitulo && <p className="mt-2 font-titulo text-lg leading-tight font-extrabold sm:text-2xl">{subtitulo}</p>}
          </div>
          {accion}
        </div>
        {datos.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {datos.map((d) => (
              <div key={d.label} className="rounded-2xl bg-feria-marino/35 px-3.5 py-2 ring-1 ring-white/20 backdrop-blur-sm">
                <dt className="text-[11px] font-bold tracking-[0.12em] text-white/80 uppercase">{d.label}</dt>
                <dd className="font-bold first-letter:uppercase">{d.valor}</dd>
              </div>
            ))}
          </dl>
        )}
        {iconos && <IconosFeria className="mt-4" />}
      </div>
    </header>
  );
}
