import programme from "../data/programme.json";
import venueFile from "../data/venues.json";

/** A festival venue (cinema, theatre, DocLab space). */
export type Venue = { id: string; name: string; short: string; address: string; lat: number; lng: number; stepFree: boolean | null; page: string };
/**
 * One showing on IDFA's public programme. Times are minutes after Thu 12 Nov 00:00 (Amsterdam), so every day of the
 * festival sits on one scale: day d (0–10) runs from d×1440. `venueId` is the cinema, `hall` IDFA's own hall label.
 * `id` is the first 8 hex characters of IDFA's show id, so a refreshed programme matches the same showings again.
 * Facts only: DocuHop doesn't carry ticket status or availability.
 */
export type Item = {
  id: string; title: string; start: number; end: number; minutes: number; day: number;
  venueId: string; venue: string; hall: string; film: string; filmKind: "f" | "c";
  english: boolean; doclab: boolean; continuous: boolean; time: string; url: string; tags: string[];
};
/** A stop as the UI sees it: `id` is the showing, `rowId` the database row (absent in previews). */
export type Mode = "foot" | "bike" | "car";
/** `travel` is a mode picked for the leg into this stop (stored); `mode` is the one that applies (not stored). */
export type UiStop = { id: string; arrival: string; duration: number; reason?: string; practical?: string; transfer?: string; fixed?: boolean; rowId?: string; pos?: number; maybe?: boolean; travel?: Mode | null; mode?: Mode };

export const FESTIVAL = { name: "IDFA 2026", first: "2026-11-12", days: 11, start: Date.parse("2026-11-11T23:00:00Z") };
export const DAY = 1440;
export const venues = (venueFile.venues as (Venue & { halls: string[] })[]).map(({ halls: _h, ...v }) => v as Venue);
export const byVenue = new Map(venues.map((v) => [v.id, v]));

/** "Sat 14 Nov" for day 2, and its parts. */
const DATE = (d: number) => new Date(Date.UTC(2026, 10, 12 + d));
export const dayInfo = (d: number) => {
  const date = DATE(d);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  return { iso: date.toISOString().slice(0, 10), weekday, letter: weekday[0], num: 12 + d, label: `${weekday} ${12 + d} Nov`, long: date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) };
};
export const DAYS = Array.from({ length: FESTIVAL.days }, (_, d) => dayInfo(d));

/** "20:00" for any festival minute; "00:30" after midnight. */
export const clock = (n: number) => String(Math.floor((((n % DAY) + DAY) % DAY) / 60)).padStart(2, "0") + ":" + String(((n % 60) + 60) % 60).padStart(2, "0");
/** "1 h 46" or "40 min". */
export const span = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? " " + String(n % 60).padStart(2, "0") : ""}` : `${n} min`);
/** Minutes of a day ("HH:MM", hours before 06:00 count as that night) to a festival minute on day d. */
export const minute = (s: string, d = 0) => { const [h, m] = s.split(":").map(Number); return d * DAY + (h < 6 ? h + 24 : h) * 60 + m; };

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
type Row = [string, string, number, number, number, string, number, number];
const films = programme.films as [string, "f" | "c"][];
export const activities: Item[] = (programme.showings as Row[]).map(([id, title, start, minutes, v, hall, film, flags]) => {
  const venue = venues[v], [filmId, kind] = films[film] ?? ["", "f"];
  const english = !!(flags & 1), doclab = !!(flags & 2);
  return {
    id, title, start, end: start + minutes, minutes, day: Math.floor(start / DAY), venueId: venue.id, venue: venue.short, hall, film: filmId, filmKind: kind,
    english, doclab, continuous: !!(flags & 8), time: `${clock(start)} – ${clock(start + minutes)}`,
    url: filmId ? `https://festival.idfa.nl/en/${kind === "c" ? "composition" : "film"}/${filmId}/${slug(title)}/` : "https://festival.idfa.nl/en/collectie/",
    tags: [english && "English subtitles", doclab && "DocLab", flags & 8 && "Walk-in programme"].filter(Boolean) as string[],
  };
}).sort((a, b) => a.start - b.start || a.venue.localeCompare(b.venue));
export const items = activities;
export const byId = new Map(activities.map((e) => [e.id, e]));
export const CAPTURED = programme.captured;
/** Every showing of the same film or programme, in time order. */
const byFilm = new Map<string, Item[]>();
for (const e of activities) if (e.film) byFilm.set(e.film, [...(byFilm.get(e.film) ?? []), e]);
export const otherShowings = (e: Item) => (byFilm.get(e.film) ?? []).filter((x) => x.id !== e.id);
export const showingsAt = (venueId: string, day?: number) => activities.filter((e) => e.venueId === venueId && (day == null || e.day === day));

/** A venue as an item for the details sheet (id "venue:<id>"). */
export const venueItem = (v: Venue): Item => ({
  id: "venue:" + v.id, title: v.name, start: 0, end: 0, minutes: 0, day: -1, venueId: v.id, venue: v.short, hall: v.address, film: "", filmKind: "f",
  english: false, doclab: false, continuous: false, time: v.address, url: `https://festival.idfa.nl/en/landing-pages/locaties/${encodeURIComponent(v.page)}/`, tags: ["Venue"],
});
export const isVenue = (id: string) => id.startsWith("venue:");
export const lookup = (id: string): Item | undefined => byId.get(id) ?? (isVenue(id) ? (() => { const v = byVenue.get(id.slice(6)); return v ? venueItem(v) : undefined; })() : undefined);

export const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();
export const COLORS = ["#2f7cf6", "#e0533d", "#8c6bd6", "#2e9d62", "#c9792b", "#d6457e", "#7a8c2e", "#1f9bb5"];
