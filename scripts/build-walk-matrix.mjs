// Builds the travel-time tables between every pair of IDFA venues, from one request per mode to the OSRM routing
// service run by FOSSGIS (routing.openstreetmap.de): src/data/walk.json (foot) and bike.json.
// OSRM's foot profile crosses the IJ on the free GVB ferries, but counts no waiting time, so walking legs that cross
// the IJ get FERRY_WAIT minutes added (ferries run every 5 to 10 minutes; half of that, rounded up).
// Re-run only when venues change: npm run walk-matrix (or pass modes: node scripts/build-walk-matrix.mjs bike)
import { readFileSync, writeFileSync } from "node:fs";

const { venues } = JSON.parse(readFileSync(new URL("../src/data/venues.json", import.meta.url), "utf8"));
const coords = venues.map((m) => `${m.lng.toFixed(6)},${m.lat.toFixed(6)}`).join(";");
const FILES = { foot: "walk", bike: "bike" };
const FERRY_WAIT = 4;
// North of the IJ: the riverbank runs at about 52.381 between Westerdok and Oostelijke Handelskade.
const north = (v) => v.lat > 52.3815 && v.lng > 4.885 && v.lng < 4.96;

for (const mode of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(FILES)) {
  const url = `https://routing.openstreetmap.de/routed-${mode}/table/v1/${mode === "foot" ? "foot" : "driving"}/${coords}?annotations=duration,distance`;
  const res = await fetch(url, { headers: { "User-Agent": "docuhop (one-off build of a travel matrix between festival cinemas)" } });
  if (!res.ok) throw new Error(`Routing service answered ${res.status} for ${mode}`);
  const body = await res.json();
  if (body.code !== "Ok") throw new Error(`Routing service (${mode}): ${body.code} ${body.message ?? ""}`);
  const minutes = body.durations.map((row, i) => row.map((s, j) => (s == null ? null : Math.round(s / 60) + (mode === "foot" && i !== j && north(venues[i]) !== north(venues[j]) ? FERRY_WAIT : 0))));
  const metres = body.distances.map((row) => row.map((d) => (d == null ? null : Math.round(d))));
  const ferry = venues.map((a, i) => venues.map((b, j) => (i !== j && north(a) !== north(b) ? 1 : 0)));
  writeFileSync(new URL(`../src/data/${FILES[mode]}.json`, import.meta.url), JSON.stringify({ source: `OSRM ${mode} profile, routing.openstreetmap.de` + (mode === "foot" ? `, plus ${FERRY_WAIT} min ferry wait across the IJ` : ""), built: new Date().toISOString().slice(0, 10), ids: venues.map((m) => m.id), minutes, metres, ...(mode === "foot" ? { ferry } : {}) }));
  const flat = minutes.flat().filter((x) => x != null && x > 0).sort((a, b) => a - b);
  console.log(`${mode}: ${venues.length} venues · median ${flat[flat.length >> 1]} min · max ${flat.at(-1)} min`);
  await new Promise((r) => setTimeout(r, 2000)); // be gentle with a free service
}
