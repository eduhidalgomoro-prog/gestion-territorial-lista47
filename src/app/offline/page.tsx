export const metadata = { title: "Sin conexión" };

export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold">Estás sin conexión</h1>
      <p className="mt-3 text-[15px] text-gris">
        La app necesita internet para leer y guardar los datos en la planilla. Cuando vuelva la conexión, recargá la página.
      </p>
      <p className="mt-3 text-[15px] text-gris">
        Si estabas tomando asistencia, las marcas que ya hiciste quedaron guardadas en el celular y se envían solas al volver la señal.
      </p>
    </main>
  );
}
