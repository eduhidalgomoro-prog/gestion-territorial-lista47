import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primario" | "secundario" | "fantasma" | "peligro" | "petroleo";

export function btn(variant: Variant = "primario", size: "md" | "lg" | "sm" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none select-none text-center",
    size === "lg" && "min-h-14 px-5 text-base",
    size === "md" && "min-h-12 px-4 text-[15px]",
    size === "sm" && "min-h-9 px-3 text-sm",
    variant === "primario" && "bg-marca text-white hover:bg-marca-600",
    variant === "petroleo" && "bg-petroleo text-white hover:bg-petroleo-600",
    variant === "secundario" && "bg-white text-tinta border border-linea hover:border-petroleo hover:text-petroleo",
    variant === "fantasma" && "text-petroleo hover:bg-petroleo-50",
    variant === "peligro" && "bg-white text-peligro border border-peligro/40 hover:bg-peligro-50",
  );
}

export function LinkButton({
  variant = "primario",
  size = "md",
  className,
  ...p
}: ComponentProps<typeof Link> & { variant?: Variant; size?: "md" | "lg" | "sm" }) {
  return <Link {...p} className={cx(btn(variant, size), className)} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div {...p} className={cx("rounded-2xl border border-linea bg-white", className)} />;
}

const BADGE = {
  gris: "bg-gray-100 text-gris",
  verde: "bg-verde-100 text-marca-600",
  petroleo: "bg-petroleo-50 text-petroleo-600",
  naranja: "bg-alerta-50 text-alerta",
  rojo: "bg-peligro-50 text-peligro",
  azul: "bg-[#e7ecf6] text-[#2b4a86]",
  violeta: "bg-[#efe9f7] text-[#5b3f86]",
} as const;

export type BadgeColor = keyof typeof BADGE;

export function Badge({ color = "gris", children, className }: { color?: BadgeColor; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide whitespace-nowrap", BADGE[color], className)}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  kicker,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  kicker?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 flex w-fit items-center gap-1 text-sm font-semibold text-petroleo hover:underline">
            ← {back.label}
          </Link>
        )}
        {kicker && <p className="mb-1 text-xs font-bold tracking-[0.18em] text-marca uppercase">{kicker}</p>}
        <h1 className="text-2xl leading-tight font-bold tracking-tight text-tinta sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-gris">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 id={id} className="text-lg font-bold text-tinta">{children}</h2>
      {action}
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-linea bg-white px-4 py-8 text-center text-[15px] text-gris">
      <p>{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "alerta" | "ok" | "peligro"; children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "rounded-xl px-4 py-3 text-[15px]",
        tone === "info" && "bg-petroleo-50 text-petroleo-600",
        tone === "alerta" && "bg-alerta-50 text-alerta",
        tone === "ok" && "bg-ok-50 text-ok",
        tone === "peligro" && "bg-peligro-50 text-peligro",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Tarjeta de indicador del dashboard. */
export function Stat({ label, value, hint, tone = "normal" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "normal" | "verde" | "alerta" | "gris" }) {
  return (
    <div className="rounded-2xl border border-linea bg-white px-3.5 py-3 sm:p-4">
      <p className="text-[13px] leading-tight font-semibold text-gris">{label}</p>
      <p
        className={cx(
          "font-titulo mt-1 text-[22px] leading-none font-bold tracking-tight sm:mt-1.5 sm:text-[26px]",
          tone === "verde" && "text-marca",
          tone === "alerta" && "text-alerta",
          tone === "gris" && "text-gris",
          tone === "normal" && "text-tinta",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-gris">{hint}</p>}
    </div>
  );
}

/** Sello «Lista 47» (círculo verde como en la gráfica de campaña). */
export function SelloLista47({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 flex-col items-center justify-center rounded-full bg-verde leading-none font-extrabold text-white ring-2 ring-white/70", className)}
      style={{ width: size, height: size, fontFamily: "var(--font-titulo)" }}
    >
      <span style={{ fontSize: size * 0.2 }}>LISTA</span>
      <span style={{ fontSize: size * 0.42 }}>47</span>
    </span>
  );
}
