import { useEffect, useRef, useState } from "react";
import { byId, byVenue, clock, span, venueItem, type Item, type Venue, type UiStop } from "../lib/catalogue";
import type { TransportMode } from "../data/transport";
import type { Spot } from "../lib/location";

/** Transport drawn over the map: the modes switched on, and which stop is selected. */
export type TransportLayer = { modes: TransportMode[]; selected: { mode: string; stop: number } | null; onSelect: (mode: string, stop: number) => void };
export const stopPoint = (s: TransportMode["stops"][number]): [number, number] | null => {
  const m = s.museumId ? byVenue.get(s.museumId) : undefined;
  return m ? [m.lat, m.lng] : s.at ?? null;
};

/** A route drawn on the map. Stops of the `numbered` route get lower-third labels (venue · time, title). */
export type MapLine = { stops: UiStop[]; color: string; numbered?: boolean; dashed?: boolean };
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type Leaflet = any; // loaded from the CDN at runtime, as before

/** Loads Leaflet once: a second copy (e.g. from a double mount) breaks lines drawn on a map made by the first. */
let leafletLoading: Promise<void> | null = null;
function loadLeaflet() {
  if ((window as any).L) return Promise.resolve();
  // Bundled with the site rather than loaded from a CDN, so no visitor's IP address goes to a third party for it.
  leafletLoading ??= Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")])
    .then(([mod]) => { (window as any).L = (mod as any).default ?? mod; })
    .catch(() => { leafletLoading = null; throw new Error("Map library could not load."); });
  return leafletLoading;
}

export function MapView({ visible, lines, onSelect, focus, fit, transport, me, locate = 0, meLabel, now = -1, zoomBy = 0 }: { visible: Item[]; lines: MapLine[]; onSelect: (e: Item) => void; focus: string | null; fit: number; transport?: TransportLayer; me?: Spot | null; locate?: number; meLabel?: string; now?: number; zoomBy?: number }) {
  /** Runs a camera move now, or, while the map is hidden (another view on a phone), once it is shown: Leaflet can't move a 0×0 map. */
  const pendingMove = useRef<(() => void) | null>(null);
  const move = (fn: () => void) => {
    if (!element.current?.offsetWidth) { pendingMove.current = fn; return; }
    map.current?.invalidateSize({ pan: false }); // its cached size can lag a view switch
    fn();
  };
  const element = useRef<HTMLDivElement>(null), map = useRef<Leaflet>(null), layer = useRef<Leaflet>(null), line = useRef<Leaflet>(null), rides = useRef<Leaflet>(null), select = useRef(onSelect), pickRide = useRef(transport?.onSelect);
  pickRide.current = transport?.onSelect;
  select.current = onSelect;
  const [ready, setReady] = useState(false), [error, setError] = useState(""), [zoom, setZoom] = useState(13);
  const dot = useRef<{ marker: Leaflet; circle: Leaflet } | null>(null);

  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    async function init() {
      try {
        await loadLeaflet();
        if (disposed || !element.current) return;
        const L = (window as any).L;
        map.current = L.map(element.current, { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, wheelDebounceTime: 15, minZoom: 10, maxZoom: 19, maxBounds: [[52.23, 4.68], [52.48, 5.1]] }).setView([52.368, 4.895], 14);
                let tileFailures = 0;
        const tiles = L.tileLayer("https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/pastel/EPSG:3857/{z}/{x}/{y}.png", { attribution: '<a href="https://www.pdok.nl/">Kadaster / PDOK</a> · BRT Achtergrondkaart', maxZoom: 19 });
        tiles.on("tileerror", () => { if (++tileFailures > 6) setError("Map tiles could not load. You can still browse the programme and open directions."); });
        tiles.on("load", () => { if (tileFailures === 0) setError(""); });
        tiles.addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
        line.current = L.layerGroup().addTo(map.current);
        rides.current = L.layerGroup().addTo(map.current);
        map.current.on("zoomend", () => setZoom(map.current.getZoom()));
        resize = new ResizeObserver(() => {
          map.current?.invalidateSize();
          if (pendingMove.current && element.current?.offsetWidth) { const fn = pendingMove.current; pendingMove.current = null; fn(); }
        });
        resize.observe(element.current);
        setReady(true);
      } catch {
        setError("The map could not load. The programme and directions still work.");
      }
    }
    init();
    return () => { disposed = true; resize?.disconnect(); map.current?.remove(); map.current = null; setReady(false); };
  }, []);

  /* Venue dots and the route. Each stop of the numbered route gets a lower third: "TUSCHINSKI 1 · 20:00" over the
     title. Showings already over are dimmed with a tick. Other venues are plain dots, merged into a numbered ring when
     they would overlap at this zoom. */
  useEffect(() => {
    if (!ready || !map.current) return;
    const L = (window as any).L;
    layer.current.clearLayers();
    const groups = new Map<string, Item[]>();
    visible.forEach((e) => groups.set(e.venueId, [...(groups.get(e.venueId) || []), e]));
    const numbered = lines.find((l) => l.numbered);
    const stopsAt = new Map<string, Item[]>();
    for (const s of numbered?.stops ?? []) { const e = byId.get(s.id); if (e) stopsAt.set(e.venueId, [...(stopsAt.get(e.venueId) ?? []), e]); }
    const onOther = new Map<string, string>(); // venue -> colour of another route passing it
    for (const l of lines) if (!l.numbered) for (const s of l.stops) { const id = byId.get(s.id)?.venueId; if (id) onOther.set(id, l.color); }
    const label = (n: number) => n + (n === 1 ? " showing" : " showings");

    for (const [id, list] of stopsAt) {
      const v = byVenue.get(id);
      if (!v) continue;
      const done = list.every((e) => now >= e.end);
      const html = `<span class="stop-dot${done ? " done" : ""}"></span><div class="lt${done ? " dim" : ""}">${list.map((e) => `<b>${esc(e.hall)} · ${clock(e.start)}${now >= e.end ? " ✓" : ""}</b><span>${esc(e.title)} · ${span(e.minutes)}${e.english ? " · EN subs" : ""}</span>`).join("")}</div>`;
      const icon = L.divIcon({ className: "stop-pin", html, iconSize: [22, 22], iconAnchor: [11, 11] });
      const marker = L.marker([v.lat, v.lng], { icon, keyboard: true, title: v.name, zIndexOffset: 1000 }).addTo(layer.current);
      marker.on("click", () => select.current(list.length === 1 ? list[0] : venueItem(v)));
    }

    const plain: { v: Venue; list: Item[]; at: { x: number; y: number } }[] = [];
    for (const [id, list] of groups) {
      const v = byVenue.get(id);
      if (!v || stopsAt.has(id)) continue;
      const other = onOther.get(id);
      const at = map.current.project([v.lat, v.lng], zoom);
      if (other) {
        const icon = L.divIcon({ className: "venue-pin crew", html: `<span style="background:${other}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] });
        L.marker([v.lat, v.lng], { icon, keyboard: true, title: v.name, zIndexOffset: 500 }).addTo(layer.current).on("click", () => select.current(venueItem(v)));
        continue;
      }
      plain.push({ v, list, at });
    }
    // Greedy clustering in screen pixels: the busiest venues claim their neighbours first.
    const RADIUS = 24;
    const clusters: (typeof plain)[] = [];
    for (const p of [...plain].sort((a, b) => b.list.length - a.list.length)) {
      const home = clusters.find((c) => Math.hypot(c[0].at.x - p.at.x, c[0].at.y - p.at.y) < RADIUS);
      if (home) home.push(p); else clusters.push([p]);
    }
    for (const c of clusters) {
      if (c.length === 1) {
        const { v, list } = c[0];
        const size = Math.round(12 + Math.min(list.length, 12) * 0.8);
        const icon = L.divIcon({ className: "venue-dot", html: "<span></span>", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        const marker = L.marker([v.lat, v.lng], { icon, keyboard: true, title: v.name + " · " + label(list.length) }).addTo(layer.current);
        marker.bindTooltip(`<b>${esc(v.short.toUpperCase())}</b><span>${label(list.length)}</span>`, { direction: "right", offset: [size / 2 + 4, 0], className: "lt-tip" });
        marker.on("click", () => select.current(venueItem(v)));
        continue;
      }
      const lat = c.reduce((t, p) => t + p.v.lat, 0) / c.length, lng = c.reduce((t, p) => t + p.v.lng, 0) / c.length;
      const names = c.map((p) => p.v.short);
      const icon = L.divIcon({ className: "venue-cluster", html: `<span>${c.length}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const marker = L.marker([lat, lng], { icon, keyboard: true, title: c.length + " cinemas close together: " + names.join(", ") }).addTo(layer.current);
      marker.bindTooltip(`<b>${c.length} CINEMAS</b><span>${esc(names.join(", "))}</span>`, { direction: "right", offset: [18, 0], className: "lt-tip" });
      if (zoom >= 17) {
        const container = document.createElement("div");
        for (const p of c) {
          const button = document.createElement("button");
          button.textContent = p.v.name + " · " + label(p.list.length);
          button.className = "shared-location-button";
          button.onclick = () => select.current(venueItem(p.v));
          container.appendChild(button);
        }
        marker.bindPopup(container);
      } else marker.on("click", () => map.current.fitBounds(c.map((p) => [p.v.lat, p.v.lng]), { padding: [80, 80], maxZoom: Math.min(zoom + 3, 18) }));
    }
    line.current.clearLayers();
    for (const l of lines) {
      const pts = (stops: UiStop[]) => stops.map((s) => byId.get(s.id)).filter((e): e is Item => !!e).sort((a, b) => a.start - b.start);
      const all = pts(l.stops);
      for (let i = 1; i < all.length; i++) {
        const a = byVenue.get(all[i - 1].venueId), b = byVenue.get(all[i].venueId);
        if (!a || !b || a === b || all[i].day !== all[i - 1].day) continue;
        const done = now >= all[i].start;
        L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: done ? "#9a9ba0" : l.color, weight: l.numbered ? 4 : 3, opacity: 0.9, dashArray: done ? "8 7" : l.numbered ? "10 7" : "2 8", lineCap: "round", interactive: false }).addTo(line.current);
      }
    }
  }, [ready, visible, lines, zoom, now]);

  /* Transport: lines between known ends, and square pins for boarding points, above the venue dots. */
  useEffect(() => {
    if (!ready || !map.current) return;
    const L = (window as any).L;
    rides.current.clearLayers();
    for (const mode of transport?.modes ?? []) {
      for (const [a, b] of mode.lines ?? []) {
        const p = stopPoint(mode.stops[a]), q = stopPoint(mode.stops[b]);
        if (p && q) L.polyline([p, q], { color: mode.color, weight: 5, opacity: 0.9, dashArray: mode.dashed ? "10 7" : undefined, interactive: false }).addTo(rides.current);
      }
      mode.stops.forEach((stop, i) => {
        const at = stopPoint(stop);
        if (!at) return;
        const on = transport!.selected?.mode === mode.id && transport!.selected.stop === i;
        const icon = L.divIcon({ className: "ride-pin" + (on ? " on" : ""), html: `<span style="background:${mode.color}">${mode.short}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
        const marker = L.marker(at, { icon, keyboard: true, title: stop.name + " · " + mode.name, zIndexOffset: on ? 3000 : 2000 }).addTo(rides.current);
        marker.bindTooltip(stop.name, { direction: "top", offset: [0, -14] });
        marker.on("click", () => pickRide.current?.(mode.id, i));
      });
    }
  }, [ready, transport?.modes, transport?.selected]);

  // Selecting a ride brings it, and the other end of its line, into view.
  const selectedKey = transport?.selected ? transport.selected.mode + ":" + transport.selected.stop : "";
  useEffect(() => {
    if (!ready || !transport?.selected) return;
    const mode = transport.modes.find((m) => m.id === transport.selected!.mode), i = transport.selected.stop;
    if (!mode) return;
    const ends = [i, ...(mode.lines ?? []).filter((l) => l.includes(i)).flat()].map((n) => stopPoint(mode.stops[n])).filter(Boolean);
    if (ends.length) move(() => map.current?.fitBounds(ends, { padding: [90, 90], maxZoom: 15 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedKey]);

  // Opening the transport layer frames every ride once; toggling single modes afterwards leaves the view alone.
  const ridesShown = !!transport?.modes.length;
  useEffect(() => {
    if (!ready || !ridesShown) return;
    const points = (transport?.modes ?? []).flatMap((m) => m.stops.map(stopPoint)).filter(Boolean);
    if (points.length) move(() => map.current?.fitBounds(points, { padding: [40, 40], maxZoom: 15 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ridesShown]);

  /* The blue dot: where this phone is, a pale circle for how sure the GPS is, and a cone when you're walking. */
  useEffect(() => {
    if (!ready || !map.current) return;
    const L = (window as any).L;
    if (!me) { dot.current?.marker.remove(); dot.current?.circle.remove(); dot.current = null; return; }
    const html = `<span class="me-cone"${me.heading == null ? ' hidden' : ` style="transform:rotate(${me.heading}deg)"`}></span><span class="me-dot"></span>${meLabel ? `<div class="lt me-lt"><b>You are here</b><span>${esc(meLabel)}</span></div>` : ""}`;
    const weak = me.accuracy > 60;
    if (!dot.current) {
      const circle = L.circle([me.lat, me.lng], { radius: me.accuracy, color: "#2f6fdf", weight: 1, opacity: 0.4, fillColor: "#2f6fdf", fillOpacity: 0.12, interactive: false }).addTo(map.current);
      const marker = L.marker([me.lat, me.lng], { icon: L.divIcon({ className: "me-pin" + (weak ? " weak" : ""), html, iconSize: [44, 44], iconAnchor: [22, 22] }), keyboard: false, interactive: false, zIndexOffset: 4000 }).addTo(map.current);
      dot.current = { marker, circle };
    } else {
      dot.current.marker.setLatLng([me.lat, me.lng]);
      dot.current.marker.setIcon(L.divIcon({ className: "me-pin" + (weak ? " weak" : ""), html, iconSize: [44, 44], iconAnchor: [22, 22] }));
      dot.current.circle.setLatLng([me.lat, me.lng]).setRadius(me.accuracy);
    }
  }, [ready, me, meLabel]);
  useEffect(() => () => { dot.current?.marker.remove(); dot.current?.circle.remove(); dot.current = null; }, []);

  // The locate button (and the first fix after turning it on) centres the map on you, if you're in the city.
  const hasFix = !!me;
  useEffect(() => {
    if (!ready || !me || !locate) return;
    if (map.current?.options.maxBounds?.contains?.([me.lat, me.lng]) ?? true) move(() => map.current?.flyTo([me.lat, me.lng], Math.max(map.current.getZoom(), 15), { duration: 0.6 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locate, hasFix]);

  useEffect(() => {
    if (!ready || !focus) return;
    const m = byVenue.get(focus);
    if (m) move(() => map.current?.flyTo([m.lat, m.lng], Math.max(15, map.current.getZoom()), { duration: 0.6 }));
  }, [focus, ready]);
  // The + and − buttons drawn over the map (zoomBy counts presses: positive in, negative out).
  const lastZoom = useRef(0);
  useEffect(() => { if (!ready) return; const d = zoomBy - lastZoom.current; lastZoom.current = zoomBy; if (d) map.current?.setZoom(map.current.getZoom() + Math.sign(d)); }, [zoomBy, ready]);

  useEffect(() => {
    if (!ready || !fit) return;
    const ms = lines.flatMap((l) => l.stops).map((s) => byVenue.get(byId.get(s.id)?.venueId || "")).filter((m): m is Venue => !!m);
    move(() => {
      // On a phone the sheet covers the lower part of the map: keep the route in the part you can see.
      const panel = document.querySelector<HTMLElement>(".panel"), fixed = panel && getComputedStyle(panel).position === "fixed";
      const below = fixed ? Math.max(0, window.innerHeight - panel!.getBoundingClientRect().top) : 0;
      if (ms.length) map.current?.fitBounds(ms.map((m) => [m.lat, m.lng]), fixed ? { paddingTopLeft: [40, 110], paddingBottomRight: [200, below + 40], maxZoom: 15 } : { padding: [90, 140], paddingBottomRight: [300, 140], maxZoom: 15 });
      else map.current?.setView([52.368, 4.895], 14);
    });
    // Refit only when asked (fit counter), not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, ready]);

  return <><div ref={element} className="map-canvas" aria-label="Map of Amsterdam with IDFA cinemas" />{error && <p className="map-error" role="alert">{error}</p>}</>;
}
