"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { achicar } from "@/components/flyer-imagen";
import {
  IconAlert, IconArrowRight, IconCalendar, IconCheck, IconClock, IconCopy, IconDownload, IconImage, IconLink, IconMore, IconPin, IconSearch, IconUpload, IconWhatsApp, IconX,
} from "@/components/icons";
import { cx } from "@/components/ui";
import { esFlyerSubido, formatoDe, linkDescarga, type FormatoFlyer } from "@/lib/flyers";
import { formatDate, MESES, nombreMes, normalizeText } from "@/lib/format";
import { ESTADOS_FLYER, type EstadoFlyer } from "@/lib/schema";
import { flyerAction } from "../actions";

export interface FlyerItem {
  id: string;
  nombre: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  interior: boolean;
  lugarClave: string; // localidad (interior) o zona (capital)
  region: string;
  barrio: string;
  lugar: string;
  direccion: string;
  publico: string;
  responsable: string;
  detalle: string;
  inscripcion: string; // link si la inscripción está abierta
  estado: EstadoFlyer;
  feed: string;
  historia: string;
  editable: boolean;
  equipo: { id: string; nombre: string; telefono: string }[];
}

type FiltroEstado = "" | EstadoFlyer;
interface Filtros { estado: string; ambito: string; lugar: string; q: string }

/** Cada estado: cómo se nombra, su color suave y el paso siguiente del trabajo. */
const ESTADOS: Record<EstadoFlyer, { plural: string; chip: string; punto: string; siguiente?: { a: EstadoFlyer; label: string } }> = {
  SOLICITADO: { plural: "Solicitados", chip: "bg-[#eef1f5] text-[#4a5568]", punto: "bg-[#94a3b8]", siguiente: { a: "EN DISEÑO", label: "Comenzar diseño" } },
  "EN DISEÑO": { plural: "En diseño", chip: "bg-[#e6f0fb] text-[#1f5fa8]", punto: "bg-[#3b82c4]", siguiente: { a: "PARA APROBACIÓN", label: "Enviar a aprobación" } },
  "PARA APROBACIÓN": { plural: "Para aprobación", chip: "bg-alerta-50 text-alerta", punto: "bg-[#d99a2b]", siguiente: { a: "APROBADO", label: "Marcar aprobado" } },
  APROBADO: { plural: "Aprobados", chip: "bg-verde-50 text-marca-600", punto: "bg-verde", siguiente: { a: "PUBLICADO", label: "Marcar publicado" } },
  PUBLICADO: { plural: "Publicados", chip: "bg-marca text-white", punto: "bg-marca" },
};
const titulo = (e: string) => e.charAt(0) + e.slice(1).toLowerCase();
const KEY_FILTROS = "gt47-flyers-filtros";

/** «MIÉ 14 OCT». */
function diaCorto(fecha: string) {
  return fecha ? formatDate(fecha, { weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, "").toUpperCase() : "SIN FECHA";
}
const horario = (it: FlyerItem) => (it.horaInicio ? `${it.horaInicio}${it.horaFin ? `–${it.horaFin}` : ""}` : "");
const tieneFeed = (it: FlyerItem) => !!it.feed;
const tieneHistoria = (it: FlyerItem) => !!it.historia;

/** Días hasta la actividad (null = sin fecha). */
function diasHasta(fecha: string, hoy: string): number | null {
  if (!fecha) return null;
  return Math.round((Date.parse(`${fecha}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
}

/** Texto limpio para pegar en Canva o WhatsApp. */
function datosParaDiseno(it: FlyerItem): string {
  const cuando = it.fecha ? formatDate(it.fecha, { weekday: "long", day: "numeric", month: "long" }) : "Fecha a confirmar";
  // Bloques separados por un renglón vacío; los datos que faltan no dejan huecos.
  const bloques: string[][] = [
    [it.nombre.toUpperCase()],
    [cuando.charAt(0).toUpperCase() + cuando.slice(1), horario(it).replace("–", " a ")],
    [it.lugar, it.direccion, it.barrio ? `Barrio ${it.barrio}` : "", it.interior ? it.lugarClave : "Corrientes Capital"],
    [it.publico ? `Público: ${it.publico}` : ""],
    [it.inscripcion ? `Inscripción:\n${it.inscripcion}` : ""],
  ];
  return bloques.map((b) => b.filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
}

function whatsappEquipo(u: { nombre: string; telefono: string }, it: FlyerItem): string {
  const cuando = it.fecha ? formatDate(it.fecha, { weekday: "long", day: "numeric", month: "long" }) : "";
  const piezas = [it.feed ? `📱 Feed: ${it.feed}` : "", it.historia ? `📲 Historias: ${it.historia}` : ""].filter(Boolean);
  const texto = [
    `Hola ${u.nombre} 👋 Te paso el material de:`,
    "",
    `*${it.nombre}*`,
    cuando && cuando.charAt(0).toUpperCase() + cuando.slice(1),
    horario(it).replace("–", " a "),
    "",
    `Estado: ${titulo(it.estado)}`,
    ...piezas,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
  return `https://wa.me/549${u.telefono}?text=${encodeURIComponent(texto)}`;
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    window.prompt("Copiá el texto:", texto);
    return false;
  }
}

export function TableroFlyers({
  anio, mes, hoy, conAmbito, puedeEditar, items: inicial, sinPedido: sinPedidoInicial, filtrosIniciales,
}: {
  anio: number;
  mes: number;
  hoy: string;
  conAmbito: boolean;
  puedeEditar: boolean;
  items: FlyerItem[];
  sinPedido: FlyerItem[];
  filtrosIniciales: Filtros;
}) {
  const router = useRouter();
  // Cambios hechos acá (estado, piezas) se ven al instante; cuando llegan los datos nuevos del servidor coinciden.
  const [cambios, setCambios] = useState<Record<string, Partial<FlyerItem>>>({});
  const [armados, setArmados] = useState<Set<string>>(new Set());
  const [f, setF] = useState<Filtros>(filtrosIniciales);
  const [aviso, setAviso] = useState("");

  const aplicar = (it: FlyerItem) => ({ ...it, ...cambios[it.id] });
  const items = useMemo(
    () => [...inicial, ...sinPedidoInicial.filter((it) => armados.has(it.id) && !inicial.some((x) => x.id === it.id))].map(aplicar).sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inicial, sinPedidoInicial, cambios, armados],
  );
  const sinPedido = sinPedidoInicial.filter((it) => !armados.has(it.id) && !inicial.some((x) => x.id === it.id));

  function cambiar(id: string, patch: Partial<FlyerItem>) {
    setCambios((c) => ({ ...c, [id]: { ...c[id], ...patch } }));
  }

  // Al entrar desde el menú (sin filtros en la dirección): se retoman los últimos filtros de esta sesión.
  useEffect(() => {
    if (window.location.search) return;
    try {
      const guardado = new URLSearchParams(sessionStorage.getItem(KEY_FILTROS) ?? "");
      if (!guardado.size) return;
      const g = (k: string) => guardado.get(k) ?? "";
      // Lo guardado en el navegador manda al volver a entrar (solo existe después de montar).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setF({ estado: g("estado"), ambito: g("ambito"), lugar: g("lugar"), q: g("q") });
      if (g("mes") !== String(mes) || g("anio") !== String(anio)) router.replace(`/flyers?${guardado}`, { scroll: false });
    } catch {
      // ignorar
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Los filtros quedan en la dirección (al volver de una actividad siguen iguales) y en la sesión (al volver desde el menú).
  useEffect(() => {
    const p = new URLSearchParams({ mes: String(mes), anio: String(anio) });
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    window.history.replaceState(window.history.state, "", `/flyers?${p}`);
    try {
      sessionStorage.setItem(KEY_FILTROS, p.toString());
    } catch {
      // sin almacenamiento: no pasa nada
    }
  }, [f, mes, anio]);

  function ir(nuevoMes: number, nuevoAnio: number) {
    const p = new URLSearchParams({ mes: String(nuevoMes), anio: String(nuevoAnio) });
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    router.push(`/flyers?${p}`, { scroll: false });
  }

  // Filtro de Capital / Interior y localidad (o zona de Capital), y búsqueda.
  const ambito = conAmbito && (f.ambito === "capital" || f.ambito === "interior") ? f.ambito : "";
  const lugares = useMemo(
    () => [...new Set(items.filter((it) => !ambito || it.interior === (ambito === "interior")).map((it) => it.lugarClave).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [items, ambito],
  );
  const lugar = lugares.includes(f.lugar) ? f.lugar : "";
  const qn = normalizeText(f.q);
  const pasa = (it: FlyerItem) =>
    (!ambito || it.interior === (ambito === "interior")) &&
    (!lugar || it.lugarClave === lugar) &&
    (!qn || normalizeText([it.nombre, it.lugarClave, it.region, it.barrio, it.responsable, it.lugar].join(" ")).includes(qn));
  const enAlcance = items.filter(pasa);
  const cuenta = (e: EstadoFlyer) => enAlcance.filter((it) => it.estado === e).length;
  const estado = (ESTADOS_FLYER as readonly string[]).includes(f.estado) ? (f.estado as FiltroEstado) : "";
  const visibles = estado ? enAlcance.filter((it) => it.estado === estado) : enAlcance;
  const sinPedidoVisibles = sinPedido.filter(pasa);

  const pendientes = cuenta("SOLICITADO") + cuenta("EN DISEÑO");
  const esperando = cuenta("PARA APROBACIÓN");
  const aprobados = cuenta("APROBADO");
  const publicados = cuenta("PUBLICADO");
  const anioActual = Number(hoy.slice(0, 4));

  function mostrarAviso(t: string) {
    setAviso(t);
    setTimeout(() => setAviso(""), 2200);
  }

  return (
    <div className="pb-6">
      {/* Encabezado: cómo viene el trabajo, en pocas palabras */}
      <header className="mb-4">
        <p className="text-[12px] font-extrabold tracking-[0.16em] text-marca uppercase">Comunicación</p>
        <h1 className="font-titulo text-[30px] leading-tight font-extrabold text-petroleo-600">Flyers</h1>
        <p className="text-[15px] font-semibold text-gris">{mes ? `${nombreMes(mes)} ${anio}` : `Todo ${anio}`}</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Resumen">
          <Resumen n={pendientes} texto={pendientes === 1 ? "pendiente de diseño" : "pendientes de diseño"} punto="bg-[#3b82c4]" />
          <Resumen n={esperando} texto="esperando aprobación" punto="bg-[#d99a2b]" />
          {aprobados > 0 && <Resumen n={aprobados} texto={aprobados === 1 ? "aprobado sin publicar" : "aprobados sin publicar"} punto="bg-verde" />}
          <Resumen n={publicados} texto={publicados === 1 ? "publicado" : "publicados"} punto="bg-marca" />
        </p>
      </header>

      {/* Filtros: período, Capital / Interior, localidad y búsqueda */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={mes} onChange={(e) => ir(Number(e.target.value), anio)} aria-label="Mes" className="h-11 rounded-full border border-linea bg-white px-4 text-[15px] font-semibold focus:border-petroleo focus:outline-none">
          <option value={0}>Todo el año</option>
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={anio} onChange={(e) => ir(mes, Number(e.target.value))} aria-label="Año" className="h-11 rounded-full border border-linea bg-white px-4 text-[15px] font-semibold focus:border-petroleo focus:outline-none">
          {[anioActual - 1, anioActual, anioActual + 1].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {conAmbito && (
          <div className="inline-flex rounded-full bg-white p-1 ring-1 ring-linea" role="group" aria-label="Capital o interior">
            {([["", "Todas"], ["capital", "Capital"], ["interior", "Interior"]] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setF((x) => ({ ...x, ambito: id, lugar: "" }))}
                aria-pressed={ambito === id}
                className={cx("h-9 rounded-full px-3.5 text-[14px] font-bold transition-colors", ambito === id ? "bg-petroleo text-white" : "text-gris hover:text-tinta")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {ambito && lugares.length > 1 && (
          <select
            value={lugar}
            onChange={(e) => setF((x) => ({ ...x, lugar: e.target.value }))}
            aria-label={ambito === "interior" ? "Localidad" : "Zona"}
            className="h-11 rounded-full border border-linea bg-white px-4 text-[15px] font-semibold focus:border-petroleo focus:outline-none"
          >
            <option value="">{ambito === "interior" ? "Todas las localidades" : "Todas las zonas"}</option>
            {lugares.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
      </div>
      {(items.length > 6 || f.q) && (
        <label className="relative mb-3 block max-w-xl">
          <span className="sr-only">Buscar actividad</span>
          <IconSearch size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gris" />
          <input
            type="search"
            value={f.q}
            onChange={(e) => setF((x) => ({ ...x, q: e.target.value }))}
            placeholder="Buscar actividad, localidad, barrio o responsable"
            className="h-11 w-full rounded-full border border-linea bg-white pr-4 pl-11 text-[15px] placeholder:text-gris/80 focus:border-petroleo focus:outline-none"
          />
        </label>
      )}

      {/* Estados: también son los filtros */}
      {/* En el celular, una sola fila que se desliza de costado (sin mover la página). */}
      <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label="Filtrar por estado">
        <ChipEstado activo={!estado} onClick={() => setF((x) => ({ ...x, estado: "" }))} n={enAlcance.length} label="Todos" />
        {ESTADOS_FLYER.map((e) => (
          <ChipEstado key={e} activo={estado === e} onClick={() => setF((x) => ({ ...x, estado: estado === e ? "" : e }))} n={cuenta(e)} label={ESTADOS[e].plural} punto={ESTADOS[e].punto} />
        ))}
      </nav>

      {visibles.length === 0 ? (
        <Vacio estado={estado} hayFiltros={!!(ambito || lugar || qn)} />
      ) : estado ? (
        <Grilla items={visibles} hoy={hoy} onCambio={cambiar} onAviso={mostrarAviso} />
      ) : (
        <div className="space-y-8">
          {ESTADOS_FLYER.filter((e) => visibles.some((it) => it.estado === e)).map((e) => (
            <section key={e} aria-labelledby={`sec-${e}`}>
              <h2 id={`sec-${e}`} className="mb-3 flex items-center gap-2 text-[17px] font-extrabold">
                <span className={cx("size-2.5 rounded-full", ESTADOS[e].punto)} aria-hidden /> {ESTADOS[e].plural}
                <span className="text-[15px] font-semibold text-gris">{visibles.filter((it) => it.estado === e).length}</span>
              </h2>
              <Grilla items={visibles.filter((it) => it.estado === e)} hoy={hoy} onCambio={cambiar} onAviso={mostrarAviso} />
            </section>
          ))}
        </div>
      )}

      {puedeEditar && sinPedidoVisibles.length > 0 && (
        <SinPedido
          items={sinPedidoVisibles}
          abierto={ambito === "interior" || items.length === 0}
          onArmar={(it) => {
            cambiar(it.id, { estado: "EN DISEÑO" });
            setArmados((s) => new Set(s).add(it.id));
            mostrarAviso(`«${it.nombre}» pasó a En diseño`);
          }}
        />
      )}

      {aviso && (
        <p role="status" className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-tinta px-4 py-2.5 text-[14px] font-semibold text-white shadow-lg lg:bottom-8" style={{ animation: "aparecer .18s ease-out" }}>
          <IconCheck size={16} className="mr-1 inline" strokeWidth={2.6} /> {aviso}
        </p>
      )}
    </div>
  );
}

function Resumen({ n, texto, punto }: { n: number; texto: string; punto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[15px]">
      <span className={cx("size-2 rounded-full", punto)} aria-hidden />
      <b className="font-titulo text-[17px] tabular-nums">{n}</b> <span className="text-gris">{texto}</span>
    </span>
  );
}

function ChipEstado({ activo, onClick, n, label, punto }: { activo: boolean; onClick: () => void; n: number; label: string; punto?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cx(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[14px] font-bold whitespace-nowrap transition-all duration-150 active:scale-[0.97]",
        activo ? "bg-petroleo text-white shadow-[0_2px_6px_rgba(16,105,133,0.25)]" : "bg-white text-tinta ring-1 ring-linea hover:ring-petroleo/50",
      )}
    >
      {punto && <span className={cx("size-2 rounded-full", punto, activo && "ring-2 ring-white/60")} aria-hidden />}
      {label}
      <span className={cx("rounded-full px-1.5 text-[13px] tabular-nums", activo ? "bg-white/20" : "bg-fondo")}>{n}</span>
    </button>
  );
}

function Vacio({ estado, hayFiltros }: { estado: FiltroEstado; hayFiltros: boolean }) {
  const textos: Record<string, string> = {
    "": hayFiltros ? "No hay flyers con estos filtros." : "No hay actividades que pidan flyer en este período.",
    SOLICITADO: "No hay flyers nuevos para empezar.",
    "EN DISEÑO": "No hay flyers en diseño ahora.",
    "PARA APROBACIÓN": "No hay piezas esperando aprobación.",
    APROBADO: "No hay flyers aprobados sin publicar.",
    PUBLICADO: "Todavía no se publicó ningún flyer en este período.",
  };
  return (
    <div className="rounded-[24px] border border-dashed border-linea bg-white px-6 py-10 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-verde-50 text-marca" aria-hidden><IconCheck size={24} strokeWidth={2.4} /></span>
      <p className="mt-3 text-[16px] font-semibold">{textos[estado]}</p>
    </div>
  );
}

function Grilla({ items, hoy, onCambio, onAviso }: { items: FlyerItem[]; hoy: string; onCambio: (id: string, p: Partial<FlyerItem>) => void; onAviso: (t: string) => void }) {
  return (
    <ul className="grid items-start gap-3 lg:grid-cols-2">
      {items.map((it) => (it.estado === "PUBLICADO" ? <Publicado key={it.id} it={it} hoy={hoy} onCambio={onCambio} onAviso={onAviso} /> : <Tarjeta key={it.id} it={it} hoy={hoy} onCambio={onCambio} onAviso={onAviso} />))}
    </ul>
  );
}

/** Capital / Interior + localidad: lo primero que se lee. */
function BadgeLugar({ it }: { it: FlyerItem }) {
  return (
    <span className={cx("inline-flex min-w-0 items-center rounded-full px-2.5 py-1 text-[12px] font-extrabold tracking-wide uppercase", it.interior ? "bg-verde-50 text-marca-600" : "bg-petroleo-50 text-petroleo-600")}>
      <span className="truncate">{it.interior ? "Interior" : "Capital"}{it.lugarClave && ` · ${it.lugarClave}`}</span>
    </span>
  );
}

function BadgeEstado({ e }: { e: EstadoFlyer }) {
  return <span key={e} className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-extrabold tracking-wide uppercase", ESTADOS[e].chip)} style={{ animation: "aparecer .2s ease-out" }}>{e}</span>;
}

/** Aviso suave si la actividad está cerca y el flyer todavía no está listo. */
function Urgencia({ it, hoy }: { it: FlyerItem; hoy: string }) {
  if (!["SOLICITADO", "EN DISEÑO"].includes(it.estado)) return null;
  const d = diasHasta(it.fecha, hoy);
  if (d === null || d < 0 || d > 5) return null;
  const texto = d === 0 ? "Es hoy" : d === 1 ? "Es mañana" : `Faltan ${d} días`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-alerta-50 px-2.5 py-1 text-[12px] font-extrabold text-alerta">
      <IconClock size={14} /> {texto}
    </span>
  );
}

function Tarjeta({ it, hoy, onCambio, onAviso, onAchicar }: { it: FlyerItem; hoy: string; onCambio: (id: string, p: Partial<FlyerItem>) => void; onAviso: (t: string) => void; onAchicar?: () => void }) {
  const [info, setInfo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [faltaConfirmar, setFaltaConfirmar] = useState(false);
  const completo = tieneFeed(it) && tieneHistoria(it);
  const sig = ESTADOS[it.estado].siguiente;

  async function pasarA(e: EstadoFlyer) {
    const anterior = it.estado;
    setError("");
    setFaltaConfirmar(false);
    setGuardando(true);
    onCambio(it.id, { estado: e }); // se ve al instante
    const fd = new FormData();
    fd.set("estado_flyer", e);
    fd.set("link_flyer", it.feed); // se conserva lo que ya había
    const r = await flyerAction(it.id, { ok: true }, fd).catch(() => ({ ok: false, message: "No se pudo guardar." }));
    setGuardando(false);
    if (!r.ok) {
      onCambio(it.id, { estado: anterior }); // nunca se muestra un estado que no se guardó
      setError(r.message || "No se pudo guardar el estado.");
    } else onAviso(`${it.nombre.length > 28 ? `${it.nombre.slice(0, 28)}…` : it.nombre} → ${titulo(e)}`);
  }

  function avanzar() {
    if (!sig) return;
    // Antes de pedir aprobación: avisar si falta alguna pieza (sin bloquear: a veces se usa una sola).
    if (sig.a === "PARA APROBACIÓN" && !completo && !faltaConfirmar) return setFaltaConfirmar(true);
    pasarA(sig.a);
  }

  return (
    <li className="rounded-[24px] bg-white p-4 shadow-[0_1px_3px_rgba(16,105,133,0.07)] ring-1 ring-linea/70 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <BadgeLugar it={it} />
          <Urgencia it={it} hoy={hoy} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <BadgeEstado e={it.estado} />
          {onAchicar && (
            <button type="button" onClick={onAchicar} className="flex size-9 items-center justify-center rounded-full text-gris hover:bg-fondo" aria-label="Achicar tarjeta">
              <IconX size={18} />
            </button>
          )}
        </div>
      </div>

      <h3 className="mt-2.5 font-titulo text-[19px] leading-snug font-extrabold text-tinta">{it.nombre}</h3>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
        <span className="inline-flex items-center gap-1.5 font-extrabold text-petroleo-600"><IconCalendar size={17} /> {diaCorto(it.fecha)}</span>
        {horario(it) && <span className="inline-flex items-center gap-1.5 font-semibold text-tinta"><IconClock size={17} className="text-gris" /> {horario(it)}</span>}
      </p>
      {(it.lugar || it.barrio) && (
        <p className="mt-1 flex items-start gap-1.5 text-[15px] text-gris">
          <IconPin size={17} className="mt-0.5 shrink-0" /> {[it.lugar, it.barrio && `B° ${it.barrio}`].filter(Boolean).join(" · ")}
        </p>
      )}
      {(it.publico || it.responsable) && (
        <p className="mt-1 text-[14px] text-gris">
          {[it.publico && `Público: ${it.publico}`, it.responsable && `Responsable: ${it.responsable}`].filter(Boolean).join(" · ")}
        </p>
      )}

      <button type="button" onClick={() => setInfo((v) => !v)} aria-expanded={info} className="mt-2 inline-flex min-h-10 items-center gap-1 text-[14px] font-bold text-petroleo hover:underline">
        <IconArrowRight size={16} className={cx("transition-transform duration-150", info && "rotate-90")} /> {info ? "Ocultar información" : "Ver información para diseñar"}
      </button>
      {info && <InfoDiseno it={it} onAviso={onAviso} />}

      {/* Piezas */}
      <div className="mt-3 rounded-[20px] bg-fondo p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[12px] font-extrabold tracking-[0.12em] text-gris uppercase">Material</p>
          {completo ? (
            <span className="inline-flex items-center gap-1 text-[13px] font-extrabold text-marca-600"><IconCheck size={15} strokeWidth={2.6} /> Material completo</span>
          ) : (
            <span className="text-[13px] font-semibold text-gris">{tieneFeed(it) || tieneHistoria(it) ? "Falta 1 pieza" : "Faltan las 2 piezas"}</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Pieza it={it} formato="feed" onCambio={onCambio} onAviso={onAviso} />
          <Pieza it={it} formato="historia" onCambio={onCambio} onAviso={onAviso} />
        </div>
      </div>

      {/* Estado del trabajo */}
      <div className="mt-3">
        <Progreso it={it} onElegir={it.editable ? pasarA : undefined} />
        {it.estado === "PARA APROBACIÓN" && <p className="mt-2 text-[14px] font-semibold text-alerta">Esperando revisión.</p>}
        {faltaConfirmar && (
          <div className="mt-2 rounded-2xl bg-alerta-50 p-3 text-[14px] text-alerta" role="alert">
            <p className="flex items-start gap-1.5 font-bold"><IconAlert size={17} className="mt-0.5 shrink-0" /> Falta subir: {[!tieneFeed(it) && "Feed (cuadrado o 4:5)", !tieneHistoria(it) && "Historia (9:16)"].filter(Boolean).join(" y ")}</p>
            <p className="mt-0.5">Si esta actividad usa una sola pieza, podés enviarla igual.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => pasarA("PARA APROBACIÓN")} className="h-10 rounded-full bg-alerta px-4 font-bold text-white">Enviar igual</button>
              <button type="button" onClick={() => setFaltaConfirmar(false)} className="h-10 rounded-full px-3 font-bold">Cancelar</button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-[14px] font-semibold text-peligro">{error}</p>}
        {it.editable && sig && !faltaConfirmar && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={avanzar}
              disabled={guardando}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-marca px-4 text-[15px] font-extrabold text-white shadow-[0_2px_6px_rgba(63,116,44,0.22)] hover:bg-marca-600 active:scale-[0.98] disabled:opacity-60"
            >
              {guardando ? "Guardando…" : <>{sig.label} <IconArrowRight size={17} /></>}
            </button>
            {it.estado === "PARA APROBACIÓN" && (
              <button type="button" onClick={() => pasarA("EN DISEÑO")} disabled={guardando} className="h-11 rounded-full px-4 text-[15px] font-bold text-tinta ring-1 ring-linea hover:bg-fondo">
                Pedir cambios
              </button>
            )}
          </div>
        )}
      </div>

      <Acciones it={it} onAviso={onAviso} />
    </li>
  );
}

/** Publicado: una fila compacta; se abre si hace falta. */
function Publicado({ it, hoy, onCambio, onAviso }: { it: FlyerItem; hoy: string; onCambio: (id: string, p: Partial<FlyerItem>) => void; onAviso: (t: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  if (abierto) return <Tarjeta it={it} hoy={hoy} onCambio={onCambio} onAviso={onAviso} onAchicar={() => setAbierto(false)} />;
  return (
    <li className="flex items-center gap-3 rounded-[20px] bg-white px-4 py-3 ring-1 ring-linea/70">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marca text-white" aria-hidden><IconCheck size={18} strokeWidth={2.6} /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-bold">{it.nombre}</p>
        <p className="text-[13.5px] text-gris">
          Publicado · {it.fecha ? formatDate(it.fecha, { day: "numeric", month: "short" }) : "sin fecha"} · Feed {tieneFeed(it) ? "✓" : "—"} · Historia {tieneHistoria(it) ? "✓" : "—"}
        </p>
      </div>
      <button type="button" onClick={() => setAbierto(true)} className="h-10 shrink-0 rounded-full px-3.5 text-[14px] font-bold text-petroleo ring-1 ring-linea hover:bg-fondo">Ver</button>
    </li>
  );
}

/** Línea de progreso: dónde está el flyer. Quien puede editar, toca un paso para cambiarlo. */
function Progreso({ it, onElegir }: { it: FlyerItem; onElegir?: (e: EstadoFlyer) => void }) {
  const actual = ESTADOS_FLYER.indexOf(it.estado);
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-extrabold tracking-[0.12em] text-gris uppercase">Estado del diseño</p>
      <ol className="flex items-center" aria-label={`Estado: ${titulo(it.estado)}`}>
        {ESTADOS_FLYER.map((e, i) => {
          const hecho = i <= actual;
          const punto = (
            <span
              className={cx(
                "flex size-6 items-center justify-center rounded-full transition-colors duration-200",
                i === actual ? "bg-petroleo text-white ring-4 ring-petroleo-50" : hecho ? "bg-verde text-white" : "bg-white ring-2 ring-linea",
              )}
            >
              {hecho && i !== actual && <IconCheck size={13} strokeWidth={3} />}
            </span>
          );
          return (
            <li key={e} className={cx("flex items-center", i < ESTADOS_FLYER.length - 1 && "flex-1")}>
              {onElegir ? (
                <button type="button" onClick={() => i !== actual && onElegir(e)} title={titulo(e)} aria-label={`Cambiar a ${titulo(e)}`} aria-current={i === actual ? "step" : undefined} className="-m-2 rounded-full p-2">
                  {punto}
                </button>
              ) : (
                <span title={titulo(e)} aria-current={i === actual ? "step" : undefined}>{punto}</span>
              )}
              {i < ESTADOS_FLYER.length - 1 && <span className={cx("mx-1 h-0.5 flex-1 rounded-full transition-colors duration-200", i < actual ? "bg-verde" : "bg-linea")} aria-hidden />}
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 text-[13px] text-gris">
        Paso {actual + 1} de {ESTADOS_FLYER.length}: <b className="font-extrabold text-petroleo-600">{titulo(it.estado)}</b>
      </p>
    </div>
  );
}

function InfoDiseno({ it, onAviso }: { it: FlyerItem; onAviso: (t: string) => void }) {
  const cuando = it.fecha ? formatDate(it.fecha, { weekday: "long", day: "numeric", month: "long" }) : "A confirmar";
  const filas: [string, ReactNode][] = [
    ["Actividad", it.nombre],
    ["Fecha", cuando.charAt(0).toUpperCase() + cuando.slice(1)],
    ["Horario", horario(it).replace("–", " a ")],
    ["Lugar", it.lugar],
    ["Dirección", it.direccion],
    ["Localidad", it.interior ? it.lugarClave || it.region : "Corrientes Capital"],
    ...(it.interior ? [["Región", it.region] as [string, ReactNode]] : [["Zona", it.lugarClave] as [string, ReactNode]]),
    ["Barrio", it.barrio],
    ["Público", it.publico],
    ["Responsable", it.responsable],
  ];
  return (
    <div className="mt-1 rounded-[20px] bg-petroleo-50/50 p-3.5" style={{ animation: "aparecer .18s ease-out" }}>
      <dl className="grid gap-x-4 gap-y-2 text-[14px] sm:grid-cols-2">
        {filas.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11.5px] font-extrabold tracking-[0.1em] text-gris uppercase">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
        <div className="sm:col-span-2">
          <dt className="text-[11.5px] font-extrabold tracking-[0.1em] text-gris uppercase">Inscripción</dt>
          {it.inscripcion ? (
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-marca-600">✓ Disponible</span>
              <button type="button" onClick={async () => (await copiar(it.inscripcion)) && onAviso("Link copiado")} className="inline-flex h-9 items-center gap-1 rounded-full bg-white px-3 text-[13px] font-bold ring-1 ring-linea">
                <IconCopy size={15} /> Copiar link
              </button>
              <a href={it.inscripcion} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 rounded-full bg-white px-3 text-[13px] font-bold ring-1 ring-linea">
                <IconLink size={15} /> Abrir
              </a>
            </dd>
          ) : (
            <dd className="font-semibold text-gris">Sin formulario</dd>
          )}
        </div>
        {it.detalle && (
          <div className="sm:col-span-2">
            <dt className="text-[11.5px] font-extrabold tracking-[0.1em] text-gris uppercase">Detalle</dt>
            <dd className="whitespace-pre-line">{it.detalle}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/** Copiar datos (a la vista) y el resto agrupado en «Compartir con equipo» y «Más». */
function Acciones({ it, onAviso }: { it: FlyerItem; onAviso: (t: string) => void }) {
  const [menu, setMenu] = useState<"" | "equipo" | "mas">("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const cerrar = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu("");
    document.addEventListener("click", cerrar);
    return () => document.removeEventListener("click", cerrar);
  }, [menu]);
  const boton = "inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold ring-1 ring-linea hover:bg-fondo";
  return (
    <div ref={ref} className="relative mt-3 flex flex-wrap gap-2 border-t border-linea/70 pt-3">
      <button type="button" onClick={async () => (await copiar(datosParaDiseno(it))) && onAviso("Datos copiados")} className={boton}>
        <IconCopy size={17} /> Copiar datos
      </button>
      <button type="button" onClick={() => setMenu(menu === "equipo" ? "" : "equipo")} aria-expanded={menu === "equipo"} className={cx(boton, "text-[#1f8f4e]")}>
        <IconWhatsApp size={17} /> <span className="sm:hidden">Equipo</span><span className="hidden sm:inline">Compartir con equipo</span>
      </button>
      <button type="button" onClick={() => setMenu(menu === "mas" ? "" : "mas")} aria-expanded={menu === "mas"} aria-label="Más acciones" className={cx(boton, "px-2.5")}>
        <IconMore size={18} />
      </button>
      {menu && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-2xl bg-white p-1.5 shadow-[0_8px_24px_rgba(16,105,133,0.18)] ring-1 ring-linea" role="menu" style={{ animation: "aparecer .15s ease-out" }}>
          {menu === "equipo" ? (
            it.equipo.length ? (
              it.equipo.map((u) => (
                <a key={u.id} role="menuitem" href={whatsappEquipo(u, it)} target="_blank" rel="noopener noreferrer" onClick={() => setMenu("")} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold hover:bg-fondo">
                  <IconWhatsApp size={18} className="text-[#1f8f4e]" /> Enviar a {u.nombre}
                </a>
              ))
            ) : (
              <p className="p-3 text-[13px] text-gris">Para enviar por WhatsApp falta cargar el teléfono del responsable en Configuración → Usuarios.</p>
            )
          ) : (
            <>
              <Link role="menuitem" href={`/actividades/${it.id}`} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold hover:bg-fondo">
                <IconArrowRight size={17} /> Ver actividad completa
              </Link>
              {it.inscripcion && (
                <button role="menuitem" type="button" onClick={async () => { setMenu(""); if (await copiar(it.inscripcion)) onAviso("Link de inscripción copiado"); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-[15px] font-semibold hover:bg-fondo">
                  <IconLink size={17} /> Copiar link de inscripción
                </button>
              )}
              {it.feed && !esFlyerSubido(it.feed) && (
                <a role="menuitem" href={it.feed} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold hover:bg-fondo">
                  <IconLink size={17} /> Abrir link del flyer
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Una pieza (Feed o Historia): miniatura si existe; si no, subir. Se ve en grande tocando la miniatura. */
function Pieza({ it, formato, onCambio, onAviso }: { it: FlyerItem; formato: FormatoFlyer; onCambio: (id: string, p: Partial<FlyerItem>) => void; onAviso: (t: string) => void }) {
  const f = formatoDe(formato);
  const historia = formato === "historia";
  const url = historia ? it.historia : it.feed;
  const subida = esFlyerSubido(url);
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<"" | "preparando" | "subiendo" | "quitando">("");
  const [error, setError] = useState("");
  const [grande, setGrande] = useState(false);
  const etiqueta = historia ? "Historia" : "Feed";
  const endpoint = `/api/flyer/${encodeURIComponent(it.id)}?formato=${f.id}`;

  function elegir() {
    if (subida && !confirm(`¿Reemplazar ${historia ? "la historia" : "el feed"}? La imagen anterior se borra.`)) return;
    input.current?.click();
  }

  async function subir(file: File) {
    setError("");
    if (!file.type.startsWith("image/")) return setError("Elegí una imagen (JPG o PNG).");
    try {
      setEstado("preparando");
      const blob = await achicar(file);
      setEstado("subiendo");
      const fd = new FormData();
      const tipo = blob.type || file.type;
      fd.append("archivo", new File([blob], `flyer.${tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg"}`, { type: tipo }));
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "No se pudo subir la imagen.");
      onCambio(it.id, historia ? { historia: data.url } : { feed: data.url });
      onAviso(`✓ ${etiqueta} subido`);
      setGrande(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setEstado("");
      if (input.current) input.current.value = "";
    }
  }

  async function quitar() {
    if (!confirm(`¿Quitar ${historia ? "la historia" : "el feed"}? La imagen se borra.`)) return;
    setEstado("quitando");
    const res = await fetch(endpoint, { method: "DELETE" }).catch(() => null);
    setEstado("");
    if (!res?.ok) return setError("No se pudo quitar la imagen.");
    onCambio(it.id, historia ? { historia: "" } : { feed: "" });
    setGrande(false);
  }

  const marco = historia ? "h-36 w-[81px]" : "h-36 w-[115px]";
  return (
    <div className="flex min-w-0 flex-col items-center rounded-2xl bg-white p-2.5 text-center ring-1 ring-linea/60">
      <p className="text-[13px] leading-tight font-extrabold">{etiqueta}<span className="block text-[12px] font-semibold text-gris">{f.medida}</span></p>
      {subida ? (
        <>
          <button type="button" onClick={() => setGrande(true)} className={cx("mt-2 overflow-hidden rounded-xl bg-fondo ring-1 ring-linea transition-transform hover:scale-[1.02]", marco)} title="Ver en grande">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={url} src={url} alt={`${etiqueta} de ${it.nombre}`} loading="lazy" className="size-full object-cover" style={{ animation: "aparecer .25s ease-out" }} />
          </button>
          <p className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-bold text-marca-600"><IconCheck size={14} strokeWidth={2.6} /> Subido</p>
        </>
      ) : (
        <>
          <div className={cx("mt-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-linea text-gris", marco)}>
            <IconImage size={26} />
            <span className="mt-1 text-[12.5px] font-semibold">{url ? "Link externo" : "Pendiente"}</span>
          </div>
          {it.editable ? (
            <button type="button" onClick={elegir} disabled={!!estado} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1 rounded-full bg-petroleo-50 px-2 text-[13.5px] font-extrabold text-petroleo-600 hover:bg-petroleo hover:text-white disabled:opacity-60">
              <IconUpload size={16} /> Subir<span className="sr-only"> {etiqueta.toLowerCase()}</span>
            </button>
          ) : (
            <p className="mt-1.5 text-[13px] text-gris">Todavía no se subió</p>
          )}
        </>
      )}
      {estado && <p className="mt-1.5 text-[13px] font-semibold text-petroleo" role="status">{estado === "preparando" ? "Preparando…" : estado === "subiendo" ? "Subiendo…" : "Quitando…"}</p>}
      {error && <p role="alert" className="mt-1.5 text-[13px] font-semibold text-peligro">{error}</p>}
      <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />

      {grande && subida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/80 p-4" role="dialog" aria-modal="true" aria-label={`${etiqueta} de ${it.nombre}`} onClick={() => setGrande(false)}>
          <div className="flex max-h-full w-full max-w-lg flex-col items-center" onClick={(e) => e.stopPropagation()} style={{ animation: "aparecer .18s ease-out" }}>
            <div className="mb-3 flex w-full items-center justify-between gap-3 text-white">
              <div className="min-w-0 text-left">
                <p className="truncate font-bold">{it.nombre}</p>
                <p className="text-[13px] text-white/80">{etiqueta} · {f.medida} · {titulo(it.estado)}</p>
              </div>
              <button type="button" onClick={() => setGrande(false)} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" aria-label="Cerrar"><IconX /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`${etiqueta} de ${it.nombre}`} className="max-h-[65dvh] w-auto rounded-2xl bg-white object-contain shadow-2xl" />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <a href={linkDescarga(url)} download className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[15px] font-bold text-tinta"><IconDownload size={18} /> Descargar</a>
              {it.editable && (
                <>
                  <button type="button" onClick={elegir} disabled={!!estado} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white/15 px-4 text-[15px] font-bold text-white hover:bg-white/25"><IconUpload size={18} /> {estado ? "Subiendo…" : "Reemplazar"}</button>
                  <button type="button" onClick={quitar} disabled={!!estado} className="inline-flex h-11 items-center rounded-full px-3 text-[15px] font-bold text-white/85 hover:text-white hover:underline">Quitar</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Actividades sin «Requiere flyer»: Diseño puede empezarlas igual. */
function SinPedido({ items, abierto, onArmar }: { items: FlyerItem[]; abierto: boolean; onArmar: (it: FlyerItem) => void }) {
  return (
    <details className="group mt-10 rounded-[24px] bg-white p-4 ring-1 ring-linea/70 sm:p-5" open={abierto}>
      <summary className="cursor-pointer list-none">
        <span className="flex items-center gap-2 text-[17px] font-extrabold">
          <IconArrowRight size={17} className="transition-transform group-open:rotate-90" /> Sin flyer pedido <span className="text-[15px] font-semibold text-gris">{items.length}</span>
        </span>
        <span className="mt-0.5 block pl-6 text-[14px] text-gris">Actividades del período que nadie marcó con «Requiere flyer». Con «Armar flyer» pasan a En diseño.</span>
      </summary>
      <ul className="mt-3 grid gap-2 lg:grid-cols-2">
        {items.map((it) => (
          <ArmarFila key={it.id} it={it} onArmar={onArmar} />
        ))}
      </ul>
    </details>
  );
}

function ArmarFila({ it, onArmar }: { it: FlyerItem; onArmar: (it: FlyerItem) => void }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  async function armar() {
    setGuardando(true);
    setError("");
    const fd = new FormData();
    fd.set("estado_flyer", "EN DISEÑO");
    fd.set("link_flyer", it.feed);
    const r = await flyerAction(it.id, { ok: true }, fd).catch(() => ({ ok: false, message: "No se pudo guardar." }));
    setGuardando(false);
    if (r.ok) onArmar(it);
    else setError(r.message || "No se pudo guardar.");
  }
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-fondo px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <BadgeLugar it={it} />
        <p className="mt-1 truncate font-bold">{it.nombre}</p>
        <p className="text-[13.5px] text-gris">{diaCorto(it.fecha)}{horario(it) && ` · ${horario(it)}`}</p>
        {error && <p className="text-[13px] font-semibold text-peligro">{error}</p>}
      </div>
      <button type="button" onClick={armar} disabled={guardando} className="h-10 shrink-0 rounded-full bg-marca px-4 text-[14px] font-extrabold text-white hover:bg-marca-600 disabled:opacity-60">
        {guardando ? "…" : "Armar flyer"}
      </button>
    </li>
  );
}
