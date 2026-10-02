"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { buscarResponsableAction, registrarAtencionAction } from "@/app/(panel)/actions";
import { ajustarCantidad, textoAnimales, type AnimalInput } from "@/lib/huellas";
import type { Especie } from "@/lib/schema";
import { IconArrowLeft, IconArrowRight, IconCheck, IconGato, IconHuella, IconPerro, IconPlus, IconVacuna } from "./icons";
import { cx } from "./ui";

/**
 * Registro rápido de una atención de Marcando Huellas (pensado para el celular, en el operativo):
 * 1 Responsable → 2 Animales → 3 Atención (cada animal) → 4 Confirmar.
 * Al guardar queda listo para la siguiente persona.
 */

const PASOS = ["Responsable", "Animales", "Atención", "Confirmar"];
const campo = "block h-14 w-full rounded-2xl border-2 border-linea bg-white px-4 text-[17px] text-tinta placeholder:text-gris/60 focus:border-marca focus:outline-none aria-[invalid=true]:border-peligro";

export interface AtencionInicial {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  animales: AnimalInput[];
}

function SiNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[15px] font-bold">{label}</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={label}>
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cx(
              "flex min-h-12 items-center justify-center gap-1.5 rounded-xl border-2 text-[16px] font-extrabold transition-colors duration-150 active:scale-[0.98]",
              value === v ? (v ? "border-marca bg-marca text-white" : "border-tinta bg-tinta text-white") : "border-linea bg-white text-tinta",
            )}
          >
            {value === v && <IconCheck size={18} />} {v ? "SÍ" : "NO"}
          </button>
        ))}
      </div>
    </div>
  );
}

function Prestacion({ label, value, onChange, Icon }: { label: string; value: boolean; onChange: (v: boolean) => void; Icon: typeof IconVacuna }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cx(
        "flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 text-left text-[16px] font-bold transition-colors duration-150 active:scale-[0.99]",
        value ? "border-marca bg-verde-50 text-marca-600" : "border-linea bg-white text-gris",
      )}
    >
      <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-lg border-2", value ? "border-marca bg-marca text-white" : "border-linea bg-white")}>
        {value && <IconCheck size={18} />}
      </span>
      <Icon size={20} /> {label}
    </button>
  );
}

function Contador({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[15px] font-bold">{label}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} className="size-12 rounded-xl border-2 border-linea bg-white text-2xl font-bold text-marca disabled:opacity-30" aria-label="Uno menos">−</button>
        <span className="w-10 text-center font-titulo text-3xl font-extrabold tabular-nums" aria-live="polite">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} className="size-12 rounded-xl border-2 border-linea bg-white text-2xl font-bold text-marca" aria-label="Uno más">+</button>
      </div>
    </div>
  );
}

export function RegistrarAtencion({ actividadId, inicial }: { actividadId: string; inicial?: AtencionInicial }) {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [dni, setDni] = useState(inicial?.dni ?? "");
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [apellido, setApellido] = useState(inicial?.apellido ?? "");
  const [telefono, setTelefono] = useState("");
  const [encontrada, setEncontrada] = useState<{ telefonoFinal: string } | null>(inicial ? { telefonoFinal: "" } : null);
  const [animales, setAnimales] = useState<AnimalInput[]>(inicial?.animales ?? []);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState("");
  const [guardado, setGuardado] = useState<{ nombre: string; perros: number; gatos: number } | null>(null);
  const [pendiente, start] = useTransition();
  const [buscando, startBuscar] = useTransition();
  const ultimoDni = useRef("");

  const perros = animales.filter((a) => a.especie === "PERRO").length;
  const gatos = animales.filter((a) => a.especie === "GATO").length;
  const set = (i: number, patch: Partial<AnimalInput>) => setAnimales((xs) => xs.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const toggleEspecie = (e: Especie) => setAnimales((xs) => ajustarCantidad(xs, e, xs.some((a) => a.especie === e) ? 0 : 1));

  function buscarDni(valor: string) {
    const d = valor.replace(/\D/g, "");
    if (d.length < 7 || d === ultimoDni.current) return;
    ultimoDni.current = d;
    startBuscar(async () => {
      const p = await buscarResponsableAction(actividadId, d);
      if (p) {
        setNombre(p.nombre);
        setApellido(p.apellido);
        setEncontrada({ telefonoFinal: p.telefonoFinal });
      } else setEncontrada(null);
    });
  }

  function validarPaso(p: number): boolean {
    const e: Record<string, string> = {};
    if (p === 0) {
      if (dni.replace(/\D/g, "").length < 7) e.dni = "Ingresá el DNI.";
      if (!nombre.trim()) e.nombre = "Falta el nombre.";
      if (!apellido.trim()) e.apellido = "Falta el apellido.";
      if (!(encontrada?.telefonoFinal) && telefono.replace(/\D/g, "").length < 8) e.telefono = "Ingresá el teléfono.";
    }
    if (p === 1 && !animales.length) e.animales = "Elegí perro, gato o ambos.";
    if (p === 2 && animales.some((a) => a.castrado === null)) e.castrado = "Respondé «¿Está castrado?» en todos los animales.";
    setErrores(e);
    return !Object.keys(e).length;
  }

  function ir(p: number) {
    if (p > paso && !validarPaso(paso)) return;
    setPaso(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function guardar() {
    setMensaje("");
    start(async () => {
      const r = await registrarAtencionAction(actividadId, { nombre, apellido, dni, telefono, animales }, inicial?.id);
      if (!r.ok || !r.data) {
        setMensaje(r.message ?? "No se pudo guardar.");
        if (r.fields) setErrores(r.fields);
        return;
      }
      setGuardado(r.data);
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function otra() {
    setPaso(0);
    setDni("");
    setNombre("");
    setApellido("");
    setTelefono("");
    setEncontrada(null);
    setAnimales([]);
    setErrores({});
    setGuardado(null);
    ultimoDni.current = "";
  }

  // Después de guardar: confirmación y listo para la próxima persona.
  if (guardado) {
    return (
      <div className="animate-[aparecer_.25s_ease-out] rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-linea">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-marca text-white"><IconCheck size={34} /></span>
        <p className="mt-3 font-titulo text-2xl font-extrabold text-marca">{inicial ? "Atención corregida" : "Atención registrada"}</p>
        <p className="mt-1 text-lg font-bold">{guardado.nombre}</p>
        <p className="mt-1 flex items-center justify-center gap-3 text-[16px] text-gris">
          {guardado.perros > 0 && <span className="inline-flex items-center gap-1"><IconPerro size={20} /> {textoAnimales(guardado.perros, 0)}</span>}
          {guardado.gatos > 0 && <span className="inline-flex items-center gap-1"><IconGato size={20} /> {textoAnimales(0, guardado.gatos)}</span>}
        </p>
        <p className="mt-1 font-bold">{guardado.perros + guardado.gatos} {guardado.perros + guardado.gatos === 1 ? "animal atendido" : "animales atendidos"}</p>
        <div className="mt-5 grid gap-2">
          {inicial ? (
            <Link href={`/actividades/${actividadId}/atenciones/${inicial.id}`} className="flex min-h-14 items-center justify-center rounded-2xl bg-marca text-[17px] font-extrabold text-white">Ver la atención</Link>
          ) : (
            <button type="button" onClick={otra} autoFocus className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-marca text-[18px] font-extrabold text-white uppercase shadow-sm active:scale-[0.99]">
              <IconPlus size={24} /> Registrar otra atención
            </button>
          )}
          <Link href={`/actividades/${actividadId}/atenciones`} className="flex min-h-12 items-center justify-center rounded-2xl border-2 border-linea bg-white font-bold text-petroleo">Ver atenciones</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Progreso */}
      <ol className="mb-4 grid grid-cols-4 gap-1.5" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li key={p}>
            <button type="button" onClick={() => (i < paso ? ir(i) : undefined)} className="block w-full text-left" aria-current={i === paso ? "step" : undefined}>
              <span className={cx("block h-2 rounded-full transition-colors duration-200", i < paso ? "bg-marca" : i === paso ? "bg-verde" : "bg-linea")} />
              <span className={cx("mt-1 block truncate text-xs font-bold", i === paso ? "text-marca-600" : "text-gris")}>{i + 1}. {p}</span>
            </button>
          </li>
        ))}
      </ol>

      {mensaje && <p role="alert" className="mb-3 rounded-xl bg-peligro-50 px-4 py-3 text-[15px] text-peligro">{mensaje}</p>}

      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-linea sm:p-6">
        {paso === 0 && (
          <div className="space-y-4">
            <h2 className="font-titulo text-xl font-extrabold">Datos del responsable</h2>
            <Campo label="DNI" error={errores.dni} nota={buscando ? "Buscando…" : encontrada && !inicial ? "Ya está en la base: completamos sus datos." : undefined}>
              <input
                className={campo}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Sin puntos"
                value={dni}
                aria-invalid={!!errores.dni}
                onChange={(e) => {
                  setDni(e.target.value);
                  if (e.target.value.replace(/\D/g, "").length >= 7) buscarDni(e.target.value);
                }}
                onBlur={(e) => buscarDni(e.target.value)}
                autoFocus={!inicial}
              />
            </Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Nombre" error={errores.nombre}>
                <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" aria-invalid={!!errores.nombre} />
              </Campo>
              <Campo label="Apellido" error={errores.apellido}>
                <input className={campo} value={apellido} onChange={(e) => setApellido(e.target.value)} autoComplete="off" aria-invalid={!!errores.apellido} />
              </Campo>
            </div>
            <Campo
              label="Teléfono"
              error={errores.telefono}
              nota={encontrada?.telefonoFinal ? `Tiene cargado uno terminado en ${encontrada.telefonoFinal}. Dejalo vacío para mantenerlo o escribí uno nuevo.` : undefined}
            >
              <input className={campo} type="tel" inputMode="tel" autoComplete="off" placeholder="Ej: 379 4123456" value={telefono} onChange={(e) => setTelefono(e.target.value)} aria-invalid={!!errores.telefono} />
            </Campo>
          </div>
        )}

        {paso === 1 && (
          <div className="space-y-4">
            <h2 className="font-titulo text-xl font-extrabold">¿Qué animales trae?</h2>
            <div className="grid grid-cols-2 gap-3">
              {([["PERRO", "Perro", IconPerro], ["GATO", "Gato", IconGato]] as const).map(([e, label, Icon]) => {
                const activo = animales.some((a) => a.especie === e);
                return (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => toggleEspecie(e)}
                    className={cx(
                      "flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 text-lg font-extrabold uppercase transition-all duration-200 active:scale-[0.98]",
                      activo ? "border-marca bg-verde-50 text-marca-600 shadow-sm" : "border-linea bg-white text-gris",
                    )}
                  >
                    <Icon size={44} />
                    {label}
                    <span className={cx("text-xs font-bold normal-case", activo ? "text-marca" : "text-gris/70")}>{activo ? "✓ Elegido" : "Tocar para elegir"}</span>
                  </button>
                );
              })}
            </div>
            {errores.animales && <p className="text-sm font-semibold text-peligro">{errores.animales}</p>}
            {perros > 0 && <Contador label="¿Cuántos perros?" value={perros} onChange={(n) => setAnimales((xs) => ajustarCantidad(xs, "PERRO", n))} />}
            {gatos > 0 && <Contador label="¿Cuántos gatos?" value={gatos} onChange={(n) => setAnimales((xs) => ajustarCantidad(xs, "GATO", n))} />}
            {animales.length > 0 && <p className="rounded-xl bg-fondo px-4 py-3 text-center text-[16px] font-bold">Total de animales: {animales.length}</p>}
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-4">
            <h2 className="font-titulo text-xl font-extrabold">Atención de cada animal</h2>
            {errores.castrado && <p className="text-sm font-semibold text-peligro">{errores.castrado}</p>}
            {animales.map((a, i) => {
              const n = animales.slice(0, i + 1).filter((x) => x.especie === a.especie).length;
              const Icon = a.especie === "PERRO" ? IconPerro : IconGato;
              return (
                <section key={i} className="space-y-3 rounded-2xl bg-fondo p-4">
                  <p className="flex items-center gap-2 font-titulo text-lg font-extrabold text-petroleo-600">
                    <span className="flex size-10 items-center justify-center rounded-full bg-white text-marca ring-1 ring-linea"><Icon size={24} /></span>
                    {a.especie === "PERRO" ? "Perro" : "Gato"} {n}
                  </p>
                  <SiNo label="¿Está castrado?" value={a.castrado} onChange={(v) => set(i, { castrado: v, quiere_castrar: v ? null : a.quiere_castrar })} />
                  {a.castrado === false && <SiNo label="¿Le gustaría castrarlo?" value={a.quiere_castrar} onChange={(v) => set(i, { quiere_castrar: v })} />}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Prestacion label="Antirrábica" Icon={IconVacuna} value={a.antirrabica} onChange={(v) => set(i, { antirrabica: v })} />
                    <Prestacion label="Desparasitación" Icon={IconHuella} value={a.desparasitacion} onChange={(v) => set(i, { desparasitacion: v })} />
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {paso === 3 && (
          <div>
            <h2 className="flex items-center gap-2 font-titulo text-xl font-extrabold"><IconHuella size={24} className="text-marca" /> Resumen de la atención</h2>
            <p className="mt-3 text-lg font-bold">{`${nombre} ${apellido}`.trim()}</p>
            <p className="text-gris">DNI {dni.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Dato Icon={IconPerro} valor={perros} label={perros === 1 ? "perro" : "perros"} />
              <Dato Icon={IconGato} valor={gatos} label={gatos === 1 ? "gato" : "gatos"} />
            </div>
            <p className="mt-2 text-center text-[16px] font-bold">Total: {animales.length} {animales.length === 1 ? "animal" : "animales"}</p>
            <ul className="mt-4 space-y-1.5 rounded-2xl bg-fondo p-4 text-[16px]">
              <li className="flex justify-between"><span>Antirrábicas</span><b>{animales.filter((a) => a.antirrabica).length}</b></li>
              <li className="flex justify-between"><span>Desparasitaciones</span><b>{animales.filter((a) => a.desparasitacion).length}</b></li>
              <li className="flex justify-between"><span>Castrados</span><b>{animales.filter((a) => a.castrado).length}</b></li>
              <li className="flex justify-between"><span>Interés en castración</span><b>{animales.filter((a) => a.castrado === false && a.quiere_castrar).length}</b></li>
            </ul>
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className="sticky bottom-20 z-10 mt-4 flex gap-2 lg:bottom-4">
        {paso > 0 && (
          <button type="button" onClick={() => ir(paso - 1)} className="flex min-h-14 items-center justify-center gap-1 rounded-2xl border-2 border-linea bg-white px-5 font-bold text-tinta">
            <IconArrowLeft size={20} /> Atrás
          </button>
        )}
        {paso < PASOS.length - 1 ? (
          <button type="button" onClick={() => ir(paso + 1)} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-marca text-[17px] font-extrabold text-white shadow-sm active:scale-[0.99]">
            Siguiente <IconArrowRight size={20} />
          </button>
        ) : (
          <button type="button" onClick={guardar} disabled={pendiente} className="flex min-h-16 flex-1 items-center justify-center gap-2 rounded-2xl bg-marca text-[18px] font-extrabold text-white uppercase shadow-sm active:scale-[0.99] disabled:opacity-60">
            <IconCheck size={24} /> {pendiente ? "Guardando…" : inicial ? "Guardar corrección" : "Guardar atención"}
          </button>
        )}
      </div>
    </div>
  );
}

function Campo({ label, error, nota, children }: { label: string; error?: string; nota?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-bold">{label} <span className="text-peligro">*</span></span>
      {children}
      {error ? <span className="mt-1 block text-sm font-semibold text-peligro">{error}</span> : nota && <span className="mt-1 block text-sm font-semibold text-marca">{nota}</span>}
    </label>
  );
}

function Dato({ Icon, valor, label }: { Icon: typeof IconPerro; valor: number; label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl bg-verde-50 py-3 text-marca-600">
      <Icon size={26} />
      <span className="font-titulo text-2xl font-extrabold">{valor}</span>
      <span className="font-bold">{label}</span>
    </div>
  );
}
