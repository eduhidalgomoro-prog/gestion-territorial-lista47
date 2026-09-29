import { redirect } from "next/navigation";
import { InstallButton } from "@/components/install-button";
import { btn, cx, SelloLista47 } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { env } from "@/lib/env";
import { resolverUsuario } from "@/lib/permisos";

export const metadata = { title: "Ingresar" };

const ERRORES: Record<string, string> = {
  no_autorizado: "Tu cuenta de Google no está habilitada. Pedile a la coordinación que te agregue como usuario.",
  estado: "La sesión de ingreso venció. Probá de nuevo.",
  email: "Tu cuenta de Google no tiene el email verificado.",
  google: "Google no respondió. Probá de nuevo en un momento.",
  config: "Falta configurar el ingreso con Google (ver README).",
  planilla: "No pudimos leer la planilla de usuarios. Probá de nuevo en un momento.",
};

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const s = await getSession();
  if (s && !q.error) {
    // Ya tiene sesión y sigue habilitado: directo al inicio.
    const ok = await snapshot().then((d) => !!resolverUsuario(s.email, s.name, d.usuarios)).catch(() => false);
    if (ok) redirect(q.next?.startsWith("/") && !q.next.startsWith("//") ? q.next : "/inicio");
  }
  const next = q.next?.startsWith("/") && !q.next.startsWith("//") ? q.next : "";
  const dev = env.devLogin();
  const usuariosDev = dev ? await snapshot().then((d) => d.usuarios.filter((u) => u.estado === "ACTIVO")).catch(() => []) : [];

  return (
    <main className="flex min-h-dvh flex-col">
      <section className="bg-institucional px-6 pt-14 pb-16 text-white">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <SelloLista47 size={92} />
          <p className="mt-5 text-xs font-bold tracking-[0.25em] text-white/80 uppercase">Coalición Cívica ARI · Corrientes</p>
          <h1 className="mt-2 text-3xl leading-tight font-extrabold">Gestión Territorial</h1>
          <p className="mt-2 text-[15px] text-white/85">Actividades, participantes, asistencia y mapa de las tres zonas de la ciudad.</p>
        </div>
      </section>

      <section className="mx-auto -mt-8 w-full max-w-md flex-1 px-4 pb-10">
        <div className="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-linea">
          {q.error && (
            <p role="alert" className="mb-4 rounded-xl bg-peligro-50 px-4 py-3 text-[15px] text-peligro">
              {ERRORES[q.error] ?? "No pudimos iniciar sesión. Probá de nuevo."}
            </p>
          )}
          <a href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`} className={cx(btn("primario", "lg"), "w-full")}>
            <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
              <path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" />
            </svg>
            Ingresar con Google
          </a>
          <p className="mt-3 text-center text-sm text-gris">Usá la cuenta de Google que te habilitó la coordinación.</p>

          <div className="my-5 h-px bg-linea" />
          <p className="mb-2 text-center text-sm font-semibold text-tinta">¿La usás seguido? Instalala en tu celular o computadora:</p>
          <InstallButton className="w-full" />
        </div>

        {dev && (
          <div className="mt-6 rounded-2xl border border-dashed border-alerta/50 bg-alerta-50 p-4 text-sm">
            <p className="mb-2 font-bold text-alerta">Modo desarrollo (solo en tu computadora)</p>
            <div className="flex flex-wrap gap-2">
              <a href="/api/auth/dev" className={btn("secundario", "sm")}>Entrar como administrador</a>
              {usuariosDev.map((u) => (
                <a key={u.id} href={`/api/auth/dev?email=${encodeURIComponent(u.email)}`} className={btn("secundario", "sm")}>
                  {u.nombre} · {u.rol.toLowerCase()}
                  {u.zona && ` ${u.zona.toLowerCase()}`}
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
