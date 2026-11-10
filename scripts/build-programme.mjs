// Turns a raw snapshot of IDFA's public programme (data-raw/idfa-*.json, facts only) into src/data/programme.json.
//
// The snapshot holds, per public showing: IDFA's show id (first 8 hex characters), start (minutes after 12 Nov 00:00,
// Amsterdam time), length, hall, title, film or programme id and flags. Nothing else is kept: no ticket status or
// availability, no descriptions, stills, logos or credits. Usage: node scripts/build-programme.mjs [data-raw/idfa-*.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const rawDir = new URL("../data-raw/", import.meta.url);
const file = process.argv[2] ?? "data-raw/" + readdirSync(rawDir).filter((f) => /^idfa-.*\.json$/.test(f)).sort().at(-1);
const raw = JSON.parse(readFileSync(new URL("../" + file, import.meta.url), "utf8"));
const { venues } = JSON.parse(readFileSync(new URL("../src/data/venues.json", import.meta.url), "utf8"));

const venueOf = (hall) => {
  const v = venues.findIndex((x) => x.halls.some((h) => hall.startsWith(h)));
  if (v < 0) throw new Error("No venue for hall " + hall);
  return v;
};
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// films: [uuid, kind f|c] — the page on IDFA's site is /en/film/<uuid>/<any slug>/ or /en/composition/<uuid>/<slug>/
const films = raw.films.map(([id, kind]) => [id, kind]);
// showings: [id, title, start, minutes, venue, hall, film, flags]
// flags: 1 fully subtitled in English · 2 DocLab / new media · 8 continuous programme. Anything else is dropped, and a
// snapshot that still carries ticket data (an older 9-field row) is refused rather than imported.
const FACTS = 1 | 2 | 8;
const showings = raw.rows.map((row) => {
  if (row.length !== 8) throw new Error("Unexpected row (ticket data?): " + JSON.stringify(row));
  const [id, start, minutes, hall, title, film, comp, flags] = row;
  return [id, raw.titles[title], start, minutes, venueOf(raw.halls[hall]), raw.halls[hall], comp >= 0 ? comp : film, flags & FACTS];
});

// What changed since the last build, so a refresh shows programme changes (saved plans keep pointing at show ids).
const outFile = new URL("../src/data/programme.json", import.meta.url);
let changes = "";
try {
  const old = new Map(JSON.parse(readFileSync(outFile, "utf8")).showings.map((s) => [s[0], s]));
  const now = new Map(showings.map((s) => [s[0], s]));
  const added = [...now.keys()].filter((id) => !old.has(id)), removed = [...old.keys()].filter((id) => !now.has(id));
  const moved = [...now.keys()].filter((id) => old.has(id) && (old.get(id)[2] !== now.get(id)[2] || old.get(id)[3] !== now.get(id)[3] || old.get(id)[5] !== now.get(id)[5]));
  const show = (s) => `${s[1]} (${s[5]}, day ${Math.floor(s[2] / 1440) + 12} Nov ${String(Math.floor((s[2] % 1440) / 60)).padStart(2, "0")}:${String(s[2] % 60).padStart(2, "0")})`;
  changes = `changes: ${added.length} new, ${removed.length} gone, ${moved.length} moved`
    + removed.map((id) => "\n  gone:  " + show(old.get(id))).join("") + moved.map((id) => "\n  moved: " + show(old.get(id)) + " → " + show(now.get(id))).join("");
} catch { /* first build */ }

const used = new Set(showings.map((s) => s[4]));
const missing = venues.filter((_, i) => !used.has(i)).map((v) => v.name);
writeFileSync(outFile, JSON.stringify({
  source: "IDFA public programme, festival.idfa.nl/en/collectie (Films & Events and New Media, audience Public)",
  captured: raw.captured, films, showings,
}));
const days = {};
for (const s of showings) days[Math.floor(s[2] / 1440) + 12] = (days[Math.floor(s[2] / 1440) + 12] ?? 0) + 1;
console.log(`${showings.length} showings, ${films.length} films/programmes, captured ${raw.captured}`);
console.log("per day (Nov):", JSON.stringify(days));
if (missing.length) console.log("venues without showings:", missing.join(", "));
if (changes) console.log(changes);
void slug;
