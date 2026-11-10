import { useEffect, useRef, useState } from "react";
import { byId, byVenue, DAY, FESTIVAL, type Mode, type UiStop } from "./catalogue";
import { analyse } from "./plan";

/** Where this phone is. Never stored or sent anywhere: it lives in this tab's memory only. */
export type Spot = { lat: number; lng: number; accuracy: number; heading: number | null };
export type LocationState = { status: "off" | "explain" | "waiting" | "on" | "blocked" | "unavailable"; spot: Spot | null };

const OK = "dh:location-ok"; // remembers that the explanation was seen, not the location
const seenExplain = () => { try { return !!localStorage.getItem(OK); } catch { return false; } };

/** The blue dot: off until asked. The first time, `explain` shows a card before the browser's own permission prompt. */
export function useLocation() {
  const [state, setState] = useState<LocationState>({ status: "off", spot: null });
  const watch = useRef<number | null>(null);
  const stop = () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); watch.current = null; };
  useEffect(() => stop, []);

  function start() {
    try { localStorage.setItem(OK, "1"); } catch { /* private mode */ }
    if (!("geolocation" in navigator)) return setState({ status: "unavailable", spot: null });
    setState((s) => ({ ...s, status: "waiting" }));
    stop();
    watch.current = navigator.geolocation.watchPosition(
      (p) => setState({ status: "on", spot: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: p.coords.speed && p.coords.speed > 0.5 ? p.coords.heading : null } }),
      (e) => { if (e.code === e.PERMISSION_DENIED) { stop(); setState({ status: "blocked", spot: null }); } else setState((s) => (s.spot ? s : { status: "unavailable", spot: null })); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }
  /** The locate button: explain first (once), then turn on; tapping again while on turns it off. */
  async function toggle() {
    if (state.status === "on" || state.status === "waiting") { stop(); return setState({ status: "off", spot: null }); }
    let granted = false;
    try { granted = (await navigator.permissions?.query({ name: "geolocation" as PermissionName }))?.state === "granted"; } catch { /* Safari before 16 */ }
    if (granted || seenExplain()) start(); else setState({ status: "explain", spot: null });
  }
  const dismiss = () => setState({ status: "off", spot: null });
  return { ...state, toggle, start, dismiss };
}

/** Walking minutes from a point to a venue: straight line × 1.3 at 4.8 km/h, like the fallback for venue pairs. */
export function walkFrom(spot: Spot, venueId: string | null | undefined) {
  const m = venueId ? byVenue.get(venueId) : undefined;
  if (!m) return null;
  const rad = Math.PI / 180, dLat = (m.lat - spot.lat) * rad, dLng = (m.lng - spot.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(spot.lat * rad) * Math.cos(m.lat * rad) * Math.sin(dLng / 2) ** 2;
  const metres = 2 * 6371000 * Math.asin(Math.sqrt(h)) * 1.3;
  const ferry = (m.lat > 52.3815) !== (spot.lat > 52.3815) && m.lng > 4.885 && m.lng < 4.96;
  return { metres: Math.round(metres), minutes: Math.max(1, Math.round(metres / 80)) + (ferry ? 6 : 0), ferry };
}

/** Minutes after Thu 12 Nov 00:00 in Amsterdam (the festival's own clock), for any moment. */
export function festivalMinute(now = new Date()) { return Math.floor((now.getTime() - FESTIVAL.start) / 60000); }
/** Today's festival day (0–10), or null outside the festival. */
export function festivalDay(now = new Date()) { const d = Math.floor(festivalMinute(now) / DAY); return d >= 0 && d < FESTIVAL.days ? d : null; }

/** The stop to head for: the first one today that hasn't finished yet; otherwise the next one on a later day. */
export function nextStop(stops: UiStop[], now = new Date()): number {
  if (!stops.length) return -1;
  const at = festivalMinute(now);
  const slots = analyse(stops).slots;
  const i = slots.findIndex((s) => s.end > at);
  return i < 0 ? -1 : stops.findIndex((s) => s.id === slots[i].id);
}

/** "On now · ends in 1 h 40", "Starts in 25 min" or "Finished", today only. */
export function liveStatus(e: { start: number; end: number }, now = new Date()): { text: string; tone: "on" | "soon" | "done" | "later" } | null {
  const at = festivalMinute(now);
  if (Math.floor(e.start / DAY) !== Math.floor(at / DAY)) return null;
  const span = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? " " + (n % 60) : ""}` : `${n} min`);
  if (at >= e.end) return { text: "Finished", tone: "done" };
  if (at >= e.start) return { text: `On now · ends in ${span(e.end - at)}`, tone: "on" };
  return { text: `Starts in ${span(e.start - at)}`, tone: e.start - at <= 60 ? "soon" : "later" };
}

/** A venue as Google Maps should find it: its street address. */
const place = (id: string) => { const m = byVenue.get(byId.get(id)?.venueId || ""); return m ? `${m.address}, Amsterdam` : null; };

/** One Google Maps link: walking directions through the places in order. No `origin` means "from where I am". */
export const TRAVELMODE: Record<Mode, string> = { foot: "walking", bike: "bicycling", car: "driving" };
export function mapsLink(places: string[], fromHere: boolean, mode: Mode = "foot") {
  const [origin, ...rest] = fromHere ? [null, ...places] : places;
  const destination = rest.at(-1)!, waypoints = rest.slice(0, -1);
  return "https://www.google.com/maps/dir/?api=1&travelmode=" + TRAVELMODE[mode] + (origin ? "&origin=" + encodeURIComponent(origin) : "")
    + "&destination=" + encodeURIComponent(destination) + (waypoints.length ? "&waypoints=" + encodeURIComponent(waypoints.join("|")) : "");
}

/** The day's plan as Google Maps links of at most 5 places each (phones accept 3 waypoints); each part starts where
 *  the last one ended. `numbers` are the stop numbers in each part. Two showings in a row at one venue count once. */
export function mapsParts(stops: UiStop[], { fromHere, skipMaybe }: { fromHere: boolean; skipMaybe: boolean }) {
  const list = stops.map((s, i) => ({ n: i + 1, s, p: place(s.id) })).filter((x) => x.p && !(skipMaybe && x.s.maybe))
    .filter((x, i, all) => i === 0 || all[i - 1].p !== x.p);
  const mode = stops.find((s) => !s.travel)?.mode ?? stops[0]?.mode ?? "foot";
  const parts: { numbers: number[]; url: string }[] = [];
  let origin = fromHere ? null : list.shift() ?? null;
  while (list.length) {
    const take = list.splice(0, 4);
    const chain = origin ? [origin, ...take] : take;
    parts.push({ numbers: chain.map((x) => x.n), url: mapsLink(chain.map((x) => x.p!), !origin, mode) });
    origin = take.at(-1)!;
  }
  if (!parts.length && origin) parts.push({ numbers: [origin.n], url: mapsLink([origin.p!], true, mode) });
  return parts;
}

/** Directions from where you are to one stop, in the way you get there. Google Maps includes the ferry. */
export const mapsNext = (s: UiStop) => { const p = place(s.id); return p ? mapsLink([p], true, s.mode) : null; };
