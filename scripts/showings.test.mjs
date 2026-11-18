// Checks how IDFA's hall labels become venues, and that an unknown hall no longer stops the programme build.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_UNKNOWN, toShowings, venueOf } from "./showings.mjs";

const { venues } = JSON.parse(readFileSync(new URL("../src/data/venues.json", import.meta.url), "utf8"));
const idOf = (hall) => venues[venueOf(hall, venues)]?.id ?? null;

test("hall labels seen in IDFA 2026 map to the right venue", () => {
  const seen = {
    "Tuschinski 3": "tuschinski", "Pathé City 7": "city", "De Balie: Grote Zaal": "balie", "de Brakke Grond: VR Gallery": "brakke-grond",
    "Eye: Cinema 2": "eye", "Kriterion 1": "kriterion", "Ketelhuis: Zaal 2": "ketelhuis", "Rialto De Pijp: Bovenzaal": "rialto-pijp",
    "Rialto VU Griffioen: Zaal 4": "rialto-vu", "The Pulse 2": "pulse", "Pathé Noord 12": "noord", "Cinema De Vlugt - Rode Zaal": "vlugt",
    "Podium Mozaïek": "mozaiek", "Carré": "carre", "Nationale Opera: Studio Boekman": "opera", "@droog: Plural Tastings": "droog",
    "Casa Rosso: Orgasmagoria": "casa-rosso", "ENTR VR Museum": "entr", "Het Documentaire Paviljoen: De Spiegel": "paviljoen",
    "ARTIS-Planetarium": "artis",
  };
  for (const [hall, id] of Object.entries(seen)) assert.equal(idOf(hall), id, hall);
});

test("Rialto SILO is known under IDFA's old and new label (since 15 Nov)", () => {
  assert.equal(idOf("Rialto SILO Zaal 1"), "rialto-silo");
  assert.equal(idOf("SILO (Rialto) Zaal 1"), "rialto-silo");
  assert.equal(venueOf("Somewhere New: Zaal 1", venues), -1);
});

// A raw snapshot like data-raw/idfa-*.json: rows are [id, start, minutes, hall, title, film, comp, flags], starts in
// minutes after Thu 12 Nov 00:00 (Amsterdam). Captured on 18 Nov at 13:00, i.e. festival minute 6 × 1440 + 780.
const CAPTURED = "2026-11-18T12:00:00.000Z", NOW = 6 * 1440 + 780;
const snapshot = (rows) => ({
  captured: CAPTURED, halls: ["Tuschinski 1", "Nowhere Hall 3"], titles: ["A film"], films: [["0b7c7e2a-0000-0000-0000-000000000000", "f", ""]],
  rows: rows.map(([hall, start], i) => [i.toString(16).padStart(8, "0"), start, 90, hall, 0, 0, -1, 1]),
});
const rows = (n, hall, start) => Array.from({ length: n }, () => [hall, start]);

test("a showing in an unknown hall is left out and reported, and the rest is built", () => {
  const raw = snapshot([...rows(20, 0, NOW + 60), ...rows(1, 1, NOW + 120)]);
  const { showings, unknown, tooMany } = toShowings(raw, venues);
  assert.equal(showings.length, 20);
  assert.deepEqual([...unknown], [["Nowhere Hall 3", 1]]);
  assert.equal(tooMany, false);
  assert.deepEqual(showings[0], ["00000000", "A film", NOW + 60, 90, venueOf("Tuschinski 1", venues), "Tuschinski 1", 0, 1]);
});

test("many upcoming showings in unknown halls are flagged (renamed halls, not one new hall)", () => {
  const raw = snapshot([...rows(10, 0, NOW + 60), ...rows(5, 1, NOW + 60)]);
  const { showings, ahead, aheadUnknown, tooMany } = toShowings(raw, venues);
  assert.equal(showings.length, 10);
  assert.equal(ahead, 15);
  assert.equal(aheadUnknown, 5);
  assert.ok(aheadUnknown / ahead > MAX_UNKNOWN);
  assert.equal(tooMany, true);
});

test("unknown halls in showings that are already over don't count towards the limit", () => {
  const raw = snapshot([...rows(10, 1, NOW - 600), ...rows(10, 0, NOW + 60)]);
  const { showings, unknown, ahead, tooMany } = toShowings(raw, venues);
  assert.equal(showings.length, 10);
  assert.deepEqual([...unknown], [["Nowhere Hall 3", 10]]);
  assert.equal(ahead, 10);
  assert.equal(tooMany, false);
});

test("a snapshot that still carries ticket data is refused", () => {
  const raw = snapshot(rows(1, 0, NOW));
  raw.rows[0].push(3);
  assert.throws(() => toShowings(raw, venues), /ticket data/);
});
