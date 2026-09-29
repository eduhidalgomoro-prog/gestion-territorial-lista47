"use client";

export default function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-extrabold">No pudimos cargar esta pantalla</h1>
      <p className="mt-3 text-[15px] text-gris">
        {error.message?.includes("planilla") ? error.message : "Puede ser un problema momentáneo de conexión con la planilla de Google."}
      </p>
      <button type="button" onClick={reset} className="mt-6 min-h-12 rounded-xl bg-marca px-5 font-bold text-white hover:bg-marca-600">
        Reintentar
      </button>
    </div>
  );
}
