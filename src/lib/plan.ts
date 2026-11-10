import walk from "../data/walk.json";
import bike from "../data/bike.json";
import { activities, byId, byVenue, clock, DAY, dayInfo, FESTIVAL, otherShowings, type Item, type Mode, type UiStop } from "./catalogue";

/* Showings at IDFA start on time, so a plan is a set of fixed times. This file works out, per festival day, how long
   it takes to get from one cinema to the next, which showings clash, and when to leave to be in your seat. */

type Matrix = { ids: string[]; minutes: (number | null)[][]; metres: (number | null)[][]; ferry?: number[][] };
const MATRIX: Partial<Record<Mode, Matrix>> = { foot: walk as Matrix, bike: bike as Matrix };
const INDEX = Object.fromEntries(Object.entries(MATRIX).map(([k, m]) => [k, new Map(m!.ids.map((id, i) => [id, i]))])) as Record<Mode, Map<string, number>>;
/** Metres per minute when a pair is missing from the routing tables (straight line × 1.3). */
const SPEED: Record<Mode, number> = { foot: 80, bike: 250, car: 400 };
/** Minutes added per leg: locking the bike; parking. */
const EXTRA: Record<Mode, number> = { foot: 0, bike: 2, car: 10 };
/** Be in your seat this long before a showing starts. */
export const SEAT = 5;
export const MODES: { id: Mode; label: string; verb: string }[] = [
  { id: "foot", label: "Walk", verb: "walking" }, { id: "bike", label: "Bike", verb: "cycling" },
];
const north = (lat: number, lng: number) => lat > 52.3815 && lng > 4.885 && lng < 4.96;

/** Travel time and distance between two venues, from the routing tables (or straight line × 1.3). `ferry` when the
 *  walk crosses the IJ on a free GVB ferry (Eye, Pathé Noord). */
export function venueLeg(a: string | undefined, b: string | undefined, mode: Mode = "foot"): { minutes: number; metres: number; mode: Mode; ferry: boolean } {
  if (!a || !b || a === b) return { minutes: 0, metres: 0, mode, ferry: false };
  const p = byVenue.get(a), q = byVenue.get(b);
  if (!p || !q) return { minutes: 0, metres: 0, mode, ferry: false };
  const ferry = mode === "foot" && north(p.lat, p.lng) !== north(q.lat, q.lng);
  const table = MATRIX[mode], i = INDEX[mode]?.get(a), j = INDEX[mode]?.get(b);
  const m = table && i != null && j != null ? table.minutes[i][j] : null;
  if (m != null) return { minutes: m + EXTRA[mode], metres: table!.metres[i!][j!] ?? 0, mode, ferry };
  const rad = Math.PI / 180, dLat = (q.lat - p.lat) * rad, dLng = (q.lng - p.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLng / 2) ** 2;
  const metres = 2 * 6371000 * Math.asin(Math.sqrt(h)) * 1.3;
  return { minutes: Math.round(metres / SPEED[mode]) + EXTRA[mode] + (ferry ? 4 : 0), metres: Math.round(metres), mode, ferry };
}
/** Travel between the venues of two showings. */
export const leg = (fromEvent: string, toEvent: string, mode: Mode = "foot") => venueLeg(byId.get(fromEvent)?.venueId, byId.get(toEvent)?.venueId, mode);
/** "6 min walk", "22 min, ferry included", "35 min walk · 12 by bike". */
export function legText(l: { minutes: number; ferry: boolean; mode: Mode }, from?: string, to?: string) {
  if (!l.minutes) return "same building";
  const base = `${l.minutes} min${l.mode === "bike" ? " by bike" : l.ferry ? ", ferry included" : " walk"}`;
  if (l.mode === "foot" && l.minutes > 30 && from && to) return `${base} · ${venueLeg(from, to, "bike").minutes} by bike`;
  return base;
}

export type Slot = UiStop & { item: Item; start: number; end: number; day: number; walk: ReturnType<typeof venueLeg>; gap: number | null;
  /** starts before the previous showing ends */ clash: boolean; /** can't get there in time (but no overlap) */ tight: boolean;
  /** when to leave the previous place (null for the day's first) */ leave: number | null };
export type Analysis = { slots: Slot[]; walkMinutes: number; metres: number; ends: number | null; tight: number; clash: number; days: number[] };

/** The plan in time order, with the trip into each showing from the previous one on the same day. */
export function analyse(stops: UiStop[], mode: Mode = "foot"): Analysis {
  const timed = stops.map((s) => ({ s, item: byId.get(s.id) })).filter((x): x is { s: UiStop; item: Item } => !!x.item)
    .sort((a, b) => a.item.start - b.item.start || a.item.end - b.item.end);
  const slots: Slot[] = [];
  for (const { s, item } of timed) {
    const prev = slots.at(-1)?.day === item.day ? slots.at(-1) : undefined;
    const w = prev ? venueLeg(prev.item.venueId, item.venueId, s.travel ?? mode) : { minutes: 0, metres: 0, mode, ferry: false };
    const gap = prev ? item.start - prev.end : null;
    const clash = !!prev && item.start < prev.end;
    const tight = !!prev && !clash && gap! < w.minutes + SEAT;
    slots.push({ ...s, item, start: item.start, end: item.end, day: item.day, walk: w, gap, clash, tight, leave: prev ? item.start - SEAT - w.minutes : null });
  }
  return {
    slots,
    walkMinutes: slots.reduce((n, s) => n + s.walk.minutes, 0),
    metres: slots.reduce((n, s) => n + s.walk.metres, 0),
    ends: slots.length ? Math.max(...slots.map((s) => s.end)) : null,
    tight: slots.filter((s) => s.tight).length,
    clash: slots.filter((s) => s.clash).length,
    days: [...new Set(slots.map((s) => s.day))],
  };
}

/** Whether a showing fits between the planned ones on its day: no overlap, and time to get there and away. */
export function fits(stops: UiStop[], candidate: Item, ignore?: string): boolean {
  return stops.every((s) => {
    if (s.id === ignore || s.id === candidate.id) return true;
    const o = byId.get(s.id);
    if (!o || o.day !== candidate.day) return true;
    if (o.end <= candidate.start) return o.end + venueLeg(o.venueId, candidate.venueId).minutes + SEAT <= candidate.start;
    if (candidate.end <= o.start) return candidate.end + venueLeg(candidate.venueId, o.venueId).minutes + SEAT <= o.start;
    return false;
  });
}

export type Fix = { rowId: string; from: Item; to: Item };
/** For a showing that clashes or can't be reached: other showings of the same film that fit the rest of the plan,
 *  earliest first. */
export function alternatives(stops: UiStop[], showingId: string): Item[] {
  const e = byId.get(showingId);
  if (!e) return [];
  const now = Math.floor((Date.now() - FESTIVAL.start) / 60000);
  return otherShowings(e).filter((x) => x.start > now && fits(stops, x, showingId) && !stops.some((s) => s.id === x.id))
    .sort((a, b) => a.start - b.start);
}

/** Leave-by time for a showing from a place (a venue, or null for "where you are" with a walk in minutes). */
export const leaveBy = (start: number, walkMinutes: number) => start - SEAT - walkMinutes;

/** A calendar file with one event per showing (Europe/Amsterdam local times). */
export function toIcs(stops: UiStop[], title: string) {
  const { slots } = analyse(stops);
  const stamp = (n: number) => `${dayInfo(Math.floor(n / DAY)).iso.replace(/-/g, "")}T${clock(n).replace(":", "")}00`;
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DocuHop//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(title)}`];
  for (const s of slots) {
    const v = byVenue.get(s.item.venueId);
    lines.push("BEGIN:VEVENT", `UID:${s.rowId ?? s.id}@docuhop`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;TZID=Europe/Amsterdam:${stamp(s.start)}`, `DTEND;TZID=Europe/Amsterdam:${stamp(s.end)}`,
      `SUMMARY:${esc(s.item.title)}`, `LOCATION:${esc([s.item.hall, v?.address, "Amsterdam"].filter(Boolean).join(", "))}`,
      `DESCRIPTION:${esc([s.reason, s.item.url, "Unofficial plan made with DocuHop, not affiliated with IDFA. Times can change: always check the official page."].filter(Boolean).join("\n"))}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export type MeetupIdea = { day: number; at: string; eventId: string; hostCrew: string; guestCrew: string; walk: number };

/** Times when one crew comes out of a showing close to where another crew goes in next, on the same day. */
export function meetupIdeas(crews: { crewId: string; stops: UiStop[] }[], maxWalk = 12): MeetupIdea[] {
  const out: MeetupIdea[] = [];
  const timed = crews.map((c) => ({ crewId: c.crewId, slots: analyse(c.stops).slots }));
  for (const a of timed) for (const b of timed) {
    if (a.crewId === b.crewId) continue;
    for (const sa of a.slots) {
      // a comes out of sa; b's next showing that day starts within 90 minutes, close by
      const sb = b.slots.find((x) => x.day === sa.day && x.start >= sa.end && x.start - sa.end <= 90);
      if (!sb) continue;
      const walked = venueLeg(sa.item.venueId, sb.item.venueId).minutes;
      if (walked > maxWalk) continue;
      if (out.some((o) => o.day === sa.day && o.eventId === sa.id)) continue;
      out.push({ day: sa.day, at: clock(sa.end + 5), eventId: sa.id, hostCrew: a.crewId, guestCrew: b.crewId, walk: walked });
    }
  }
  return out.sort((x, y) => x.day - y.day || x.at.localeCompare(y.at)).slice(0, 4);
}

/* ---------- built-in shot list ideas, made from the programme itself ---------- */

/** Picks showings in time order that don't overlap and leave time to move on: the most films in a day. */
function greedy(list: Item[], max = 4) {
  const out: Item[] = [];
  for (const e of [...list].sort((a, b) => a.end - b.end)) {
    const last = out.at(-1);
    if (out.length >= max) break;
    if (out.some((x) => x.film === e.film)) continue;
    if (!last || last.end + venueLeg(last.venueId, e.venueId).minutes + SEAT + 10 <= e.start) out.push(e);
  }
  return out;
}
export type Idea = { id: string; title: string; description: string; practical: string; route: UiStop[] };
const toStops = (list: Item[]): UiStop[] => list.map((e) => ({ id: e.id, arrival: clock(e.start), duration: e.minutes, fixed: true }));
const pick = (f: (e: Item) => boolean) => activities.filter((e) => !e.continuous && e.minutes <= 200 && f(e));
export const IDEAS: Idea[] = [
  { id: "idea-tuschinski", day: 9, title: "One cinema, no walking", description: "A Saturday in one building: films with English subtitles at Pathé Tuschinski, one after another with time for a coffee in between.", practical: "Tuschinski's foyer is a sight in itself, so come a little early.", f: (e: Item) => e.venueId === "tuschinski" && e.english },
  { id: "idea-ferry", day: 6, title: "Across the IJ", description: "A Wednesday north of the water: Eye Filmmuseum and Pathé Noord, with the free ferry from Centraal Station.", practical: "The Buiksloterweg ferry runs day and night, every few minutes. Eye is a two-minute walk from the pier.", f: (e: Item) => e.venueId === "eye" || e.venueId === "noord" },
  { id: "idea-doclab", day: 8, title: "DocLab Friday", description: "Interactive and immersive work from the DocLab programme: VR, installations and live performances.", practical: "Many DocLab pieces are short sessions with a small audience. Book a slot for each one.", f: (e: Item) => e.doclab },
  { id: "idea-leidseplein", day: 7, title: "Leidseplein evening", description: "An evening around Leidseplein: De Balie, Pathé City and the Documentaire Paviljoen in the Vondelpark are all a few minutes apart.", practical: "Grab dinner between shows on the square; the venues are a short walk from each other.", f: (e: Item) => ["balie", "city", "paviljoen"].includes(e.venueId) && e.start % DAY >= 17 * 60 },
].map(({ f, day, ...idea }) => ({ ...idea, route: toStops(greedy(pick((e) => e.day === day && f(e)))) })).filter((i) => i.route.length >= 2);
