// Matches IDFA's hall labels to DocuHop's venues and turns a raw snapshot's rows into programme showings.
// Used by scripts/build-programme.mjs and checked by scripts/showings.test.mjs (npm test).

const T0 = Date.parse("2026-11-11T23:00:00Z"); // Thu 12 Nov 00:00 in Amsterdam: starts are minutes after this
// flags: 1 fully subtitled in English · 2 DocLab / new media · 8 continuous programme. Anything else is dropped.
const FACTS = 1 | 2 | 8;
/** More than this share of the showings still to come in unknown halls looks like renamed halls, not one new hall. */
export const MAX_UNKNOWN = 0.1;

/** Index of the venue whose `halls` prefixes match IDFA's hall label ("Tuschinski 3", "Eye: Cinema 1"), or -1. */
export const venueOf = (hall, venues) => venues.findIndex((v) => v.halls.some((h) => hall.startsWith(h)));

/**
 * Showings for src/data/programme.json: [id, title, start, minutes, venue, hall, film, flags].
 * A showing in a hall that no venue knows is left out (it has no place on the map or in the walking times) and counted
 * in `unknown` (hall label → showings), so one new hall doesn't hold back the whole update. `tooMany` is set when more
 * than MAX_UNKNOWN of the showings from the capture on sit in unknown halls. A snapshot that still carries ticket data
 * (an older 9-field row) is refused rather than imported.
 */
export function toShowings(raw, venues) {
  const at = Date.parse(raw.captured);
  const from = Number.isFinite(at) ? (at - T0) / 60000 : -Infinity; // the capture, in festival minutes
  const showings = [], unknown = new Map();
  let ahead = 0, aheadUnknown = 0;
  for (const row of raw.rows) {
    if (row.length !== 8) throw new Error("Unexpected row (ticket data?): " + JSON.stringify(row));
    const [id, start, minutes, h, title, film, comp, flags] = row;
    const hall = raw.halls[h], venue = venueOf(hall, venues);
    if (start >= from) ahead++;
    if (venue < 0) {
      unknown.set(hall, (unknown.get(hall) ?? 0) + 1);
      if (start >= from) aheadUnknown++;
      continue;
    }
    showings.push([id, raw.titles[title], start, minutes, venue, hall, comp >= 0 ? comp : film, flags & FACTS]);
  }
  return { showings, unknown, ahead, aheadUnknown, tooMany: aheadUnknown > ahead * MAX_UNKNOWN };
}
