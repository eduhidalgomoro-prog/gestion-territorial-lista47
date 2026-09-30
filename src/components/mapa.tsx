"use client";

import "leaflet/dist/leaflet.css";
import type { LatLngExpression, LayerGroup, Map as LMap, Marker } from "leaflet";
import { useEffect, useRef, useState } from "react";

export const CENTRO_CORRIENTES: [number, number] = [-27.4806, -58.8341];
/** Provincia de Corrientes completa (esquinas suroeste y noreste). */
const PROVINCIA: [[number, number], [number, number]] = [[-30.75, -59.65], [-27.25, -55.7]];

/**
 * Encuadre inicial del mapa:
 * - capital: la ciudad (y se acerca a las actividades cargadas).
 * - provincia: toda la provincia, siempre (cronograma de Capital + interior).
 * - region: se acerca a las actividades de la región; si no hay, muestra la provincia.
 */
export type Encuadre = "capital" | "provincia" | "region";

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface PuntoMapa {
  id: string;
  lat: number;
  lng: number;
  nombre: string;
  fecha: string; // ya formateada
  zona: string;
  barrio: string;
  responsable: string;
  tipo: string;
  estado: string;
  asistentes: number;
  color: string; // color del estado (borde)
  emoji: string; // categoría (centro)
  categoria: string;
}

/** Mapa territorial: cada actividad es un punto; al tocarlo se ve el resumen y el link a la ficha. */
export function MapaActividades({ puntos, focoId, alto = "min(70dvh, 640px)", encuadre = "capital" }: { puntos: PuntoMapa[]; focoId?: string; alto?: string; encuadre?: Encuadre }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const grupoRef = useRef<LayerGroup | null>(null);
  // Solo se redibuja (y reencuadra) cuando cambian los puntos de verdad, no cuando cambia la referencia del arreglo.
  const clave = puntos.map((p) => `${p.id}:${p.lat}:${p.lng}:${p.estado}:${p.emoji}`).join("|");
  const puntosRef = useRef(puntos);
  useEffect(() => {
    puntosRef.current = puntos;
  }, [puntos]);

  useEffect(() => {
    const puntos = puntosRef.current;
    let cancel = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancel || !ref.current) return;
      if (!mapRef.current) {
        // Sin zoom con la rueda del mouse: así desplazar la página no mueve el mapa por accidente (se usa + / − o pellizcar).
        mapRef.current = L.map(ref.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView(CENTRO_CORRIENTES, 13);
        L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIB }).addTo(mapRef.current);
        grupoRef.current = L.layerGroup().addTo(mapRef.current);
      }
      const map = mapRef.current;
      const grupo = grupoRef.current!;
      grupo.clearLayers();
      const bounds: LatLngExpression[] = [];
      let foco: ReturnType<typeof L.marker> | null = null;
      for (const p of puntos) {
        // Pin con el emoji de la categoría y borde del color del estado.
        const s = p.id === focoId ? 42 : 30;
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:#fff;border:3px solid ${p.color};box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:${Math.round(s * 0.52)}px;line-height:1">${esc(p.emoji)}</div>`,
          iconSize: [s, s],
          iconAnchor: [s / 2, s / 2],
          popupAnchor: [0, -s / 2],
        });
        const m = L.marker([p.lat, p.lng], { icon, title: p.nombre, riseOnHover: true }).addTo(grupo);
        m.bindPopup(
          `<div style="min-width:200px">
            <div style="font-size:11px;font-weight:800;letter-spacing:.08em;color:#3f742c;text-transform:uppercase">${esc(p.emoji)} ${esc(p.tipo || p.categoria)}</div>
            <div style="font-weight:800;font-size:15px;color:#324158;margin:2px 0 6px">${esc(p.nombre)}</div>
            <div>📅 ${esc(p.fecha || "Sin fecha")}</div>
            <div>📍 ${esc(p.zona)}${p.barrio ? " · " + esc(p.barrio) : ""}</div>
            <div>👤 ${esc(p.responsable || "—")}</div>
            <div style="margin-top:4px"><b>${esc(p.estado)}</b>${p.asistentes ? ` · ${p.asistentes} asistentes` : ""}</div>
            <a href="/actividades/${encodeURIComponent(p.id)}" style="display:inline-block;margin-top:8px;padding:8px 12px;border-radius:10px;background:#3f742c;color:#fff;font-weight:700;text-decoration:none">Ver ficha</a>
          </div>`,
        );
        bounds.push([p.lat, p.lng]);
        if (p.id === focoId) foco = m;
      }
      // El contenedor puede haber cambiado de tamaño al terminar de cargar la página.
      map.invalidateSize();
      const maxZoom = encuadre === "region" ? 12 : 15;
      if (foco) {
        map.setView((foco as ReturnType<typeof L.marker>).getLatLng(), 16);
        (foco as ReturnType<typeof L.marker>).openPopup();
      } else if (encuadre === "provincia" || (encuadre === "region" && bounds.length === 0)) {
        const b = L.latLngBounds(PROVINCIA);
        map.fitBounds(b, { padding: [10, 10] });
        setTimeout(() => {
          if (mapRef.current !== map) return;
          map.invalidateSize();
          map.fitBounds(b, { padding: [10, 10] });
        }, 300);
      } else if (bounds.length > 1) {
        const b = L.latLngBounds(bounds as [number, number][]);
        map.fitBounds(b, { padding: [30, 30], maxZoom });
        // Si la página todavía se estaba acomodando, reencuadrar un instante después.
        setTimeout(() => {
          if (mapRef.current !== map) return;
          map.invalidateSize();
          map.fitBounds(b, { padding: [30, 30], maxZoom });
        }, 300);
      } else if (bounds.length === 1) {
        map.setView(bounds[0], maxZoom);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [clave, focoId, encuadre]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      grupoRef.current = null;
    },
    [],
  );

  return <div ref={ref} className="w-full overflow-hidden rounded-2xl border border-linea" style={{ height: alto }} role="region" aria-label="Mapa de actividades" />;
}

/**
 * Selector de ubicación para la carga de actividades: marcador arrastrable.
 * Tocar el mapa también mueve el marcador.
 */
export function SelectorUbicacion({ lat, lng, onChange, provincia = false }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void; provincia?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancel || !ref.current || mapRef.current) return;
      const tiene = !!(lat && lng);
      const map = L.map(ref.current, { scrollWheelZoom: false });
      // Actividad del interior todavía sin ubicar: se ve toda la provincia.
      if (!tiene && provincia) map.fitBounds(PROVINCIA);
      else map.setView(tiene ? [lat, lng] : CENTRO_CORRIENTES, tiene ? 16 : 13);
      L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIB }).addTo(map);
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:#3f742c;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });
      const marker = L.marker(tiene ? [lat, lng] : provincia ? map.getCenter() : CENTRO_CORRIENTES, { draggable: true, icon, opacity: tiene ? 1 : 0.45 }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        marker.setOpacity(1);
        onChangeRef.current(p.lat, p.lng);
      });
      map.on("click", (e) => {
        marker.setLatLng(e.latlng).setOpacity(1);
        onChangeRef.current(e.latlng.lat, e.latlng.lng);
      });
      mapRef.current = map;
      markerRef.current = marker;
      setListo(true);
    })();
    return () => {
      cancel = true;
    };
    // Solo al montar: después, los cambios de coordenadas se aplican en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando llegan coordenadas desde "Ubicar dirección" o "Usar mi ubicación".
  useEffect(() => {
    if (!listo || !mapRef.current || !markerRef.current || !lat || !lng) return;
    const cur = markerRef.current.getLatLng();
    if (Math.abs(cur.lat - lat) > 1e-7 || Math.abs(cur.lng - lng) > 1e-7) {
      markerRef.current.setLatLng([lat, lng]).setOpacity(1);
      mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 16));
    }
  }, [lat, lng, listo]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return <div ref={ref} className="h-72 w-full overflow-hidden rounded-2xl border border-linea sm:h-80" role="region" aria-label="Mapa para ubicar la actividad" />;
}
