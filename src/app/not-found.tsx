import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-extrabold">No encontramos esta página</h1>
      <p className="mt-3 text-[15px] text-gris">Puede que no exista o que tu usuario no tenga acceso (por ejemplo, una actividad de otra zona).</p>
      <Link href="/inicio" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-marca px-5 font-bold text-white hover:bg-marca-600">
        Ir al inicio
      </Link>
    </main>
  );
}
