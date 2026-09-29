"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { IconDownload, IconX } from "./icons";
import { btn, cx, SelloLista47 } from "./ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Plataforma = "ios" | "android" | "desktop" | "otro";

function detectar(): Plataforma {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows|Macintosh|Linux/.test(ua)) return "desktop";
  return "otro";
}

function subscribeStandalone(cb: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

// El aviso nativo del navegador llega una sola vez: se guarda a nivel de módulo para que
// cualquier botón de la app (inicio, menú, login) pueda usarlo.
let eventoGlobal: BeforeInstallPromptEvent | null = null;
const oyentes = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    eventoGlobal = e as BeforeInstallPromptEvent;
    oyentes.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    eventoGlobal = null;
    oyentes.forEach((f) => f());
  });
}

function useInstalacion() {
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const [, setTick] = useState(0);
  const [recienInstalada, setInstalada] = useState(false);
  const [ayuda, setAyuda] = useState<Plataforma | null>(null);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    oyentes.add(f);
    return () => {
      oyentes.delete(f);
    };
  }, []);
  async function instalar() {
    if (eventoGlobal) {
      await eventoGlobal.prompt();
      const r = await eventoGlobal.userChoice;
      if (r.outcome === "accepted") setInstalada(true);
      eventoGlobal = null;
    } else {
      setAyuda(detectar());
    }
  }
  return { instalada: standalone || recienInstalada, instalar, ayuda, cerrarAyuda: () => setAyuda(null) };
}

function Ayuda({ plataforma, onClose }: { plataforma: Plataforma; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="instalar-titulo" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="instalar-titulo" className="text-xl font-bold">Instalá la app</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gris hover:bg-gray-100" aria-label="Cerrar">
            <IconX />
          </button>
        </div>
        {plataforma === "ios" ? (
          <ol className="list-decimal space-y-2 pl-5 text-[15px]">
            <li>Abrí esta página en <b>Safari</b>.</li>
            <li>Tocá el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
            <li>Elegí <b>«Agregar a inicio»</b> y confirmá con <b>Agregar</b>.</li>
          </ol>
        ) : plataforma === "android" ? (
          <ol className="list-decimal space-y-2 pl-5 text-[15px]">
            <li>Abrí esta página en <b>Chrome</b>.</li>
            <li>Tocá el menú <b>⋮</b> arriba a la derecha.</li>
            <li>Elegí <b>«Instalar aplicación»</b> o <b>«Agregar a pantalla principal»</b>.</li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 text-[15px]">
            <li>Usá <b>Chrome</b> o <b>Edge</b> en la computadora.</li>
            <li>Buscá el ícono de instalar en la barra de direcciones (una pantalla con una flecha), o abrí el menú <b>⋮</b>.</li>
            <li>Elegí <b>«Instalar Lista 47»</b>.</li>
          </ol>
        )}
        <p className="mt-4 text-sm text-gris">Si tu navegador no ofrece la opción, podés seguir usándola desde el navegador: funciona igual.</p>
      </div>
    </div>
  );
}

/** Botón «Descargar aplicación». Se oculta solo si la app ya está instalada. */
export function InstallButton({ className }: { className?: string }) {
  const { instalada, instalar, ayuda, cerrarAyuda } = useInstalacion();
  if (instalada) return null;
  return (
    <>
      <button type="button" onClick={instalar} className={cx(btn("petroleo", "md"), className)}>
        <IconDownload /> Descargar aplicación
      </button>
      {ayuda && <Ayuda plataforma={ayuda} onClose={cerrarAyuda} />}
    </>
  );
}

/** Tarjeta destacada para el inicio: «Descargá la app en tu celular o computadora». */
export function InstallBanner() {
  const { instalada, instalar, ayuda, cerrarAyuda } = useInstalacion();
  if (instalada) return null;
  return (
    <div className="bg-institucional mb-5 flex flex-wrap items-center gap-4 rounded-2xl p-4 text-white sm:p-5">
      <SelloLista47 size={52} />
      <div className="min-w-0 flex-1">
        <p className="font-titulo text-[17px] font-bold">Descargá la app</p>
        <p className="text-sm text-white/85">Instalala en tu celular o computadora y abrila como cualquier aplicación.</p>
      </div>
      <button type="button" onClick={instalar} className={cx(btn("secundario", "md"), "w-full border-0 sm:w-auto")}>
        <IconDownload /> Descargar
      </button>
      {ayuda && <Ayuda plataforma={ayuda} onClose={cerrarAyuda} />}
    </div>
  );
}
