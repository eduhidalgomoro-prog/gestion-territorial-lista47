/**
 * Se muestra al instante al tocar un enlace del panel, mientras llegan los datos de la planilla.
 * Así la app responde enseguida en vez de parecer trabada. Solo formas grises: sin datos ni texto.
 */
export default function Cargando() {
  const bloque = "animate-pulse rounded-2xl bg-linea/55";
  return (
    <div className="mx-auto max-w-4xl" role="status" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className={`${bloque} mb-2 h-4 w-28`} />
      <div className={`${bloque} mb-2 h-8 w-2/3 max-w-sm`} />
      <div className={`${bloque} mb-6 h-4 w-40`} />
      <div className="mb-5 flex gap-2">
        <div className={`${bloque} h-10 w-24 rounded-full`} />
        <div className={`${bloque} h-10 w-24 rounded-full`} />
        <div className={`${bloque} h-10 w-24 rounded-full`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[22px] bg-white p-4 ring-1 ring-linea/70">
            <div className={`${bloque} mb-3 h-4 w-24`} />
            <div className={`${bloque} mb-2 h-6 w-3/4`} />
            <div className={`${bloque} mb-4 h-4 w-1/2`} />
            <div className={`${bloque} h-11 w-full rounded-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}
