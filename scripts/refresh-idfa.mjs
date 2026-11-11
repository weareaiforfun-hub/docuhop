// Daily refresh of IDFA's public programme, facts only. Run once a day (the Refresh programme workflow), or by hand:
//   node scripts/refresh-idfa.mjs [--force]
//
// It opens festival.idfa.nl/en/collectie/ in a headless browser and runs scripts/capture-programme.js in that page, the
// same way a visitor's filter clicks load each day. It never calls IDFA's API itself and never reads ticket data.
// Only today and later days are loaded; earlier screenings are kept from the last snapshot, so a past day doesn't
// vanish when IDFA's page stops listing it.
//
// Gentle: at most one fresh capture every 12 hours unless --force. Careful: it refuses to save when the remaining days
// suddenly lose many screenings (a page change, not a programme change), so the site keeps the last good programme.
// Writes data-raw/idfa-YYYY-MM-DD.json, then rebuilds src/data/programme.json (which prints what changed).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const T0 = Date.parse("2026-11-11T23:00:00Z"); // Thu 12 Nov 00:00 in Amsterdam (UTC+1)
const DAY = 1440, CUTOFF_HOUR = 6; // a festival day runs until 06:00 the next morning
const force = process.argv.includes("--force");

// Today in Amsterdam, as a day of November.
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
  .formatToParts(new Date()).map((p) => [p.type, p.value]));
const ymd = `${parts.year}-${parts.month}-${parts.day}`;
// Before 06:00 the festival day is still yesterday's.
const today = ymd < "2026-11-01" ? 0 : ymd > "2026-11-30" ? 99 : Number(parts.day) - (Number(parts.hour) < CUTOFF_HOUR ? 1 : 0);
if (today > 22) { console.log("IDFA 2026 is over. Nothing to refresh."); process.exit(0); }
const first = Math.max(12, today);
const days = Array.from({ length: 23 - first }, (_, i) => `2026-11-${String(first + i).padStart(2, "0")}`);
const cutoff = (first - 12) * DAY + CUTOFF_HOUR * 60; // minutes after T0: rows before it come from the last snapshot

const rawDir = new URL("data-raw/", root);
const lastFile = readdirSync(rawDir).filter((f) => /^idfa-.*\.json$/.test(f)).sort().at(-1);
const last = JSON.parse(readFileSync(new URL(lastFile, rawDir), "utf8"));
const ageH = (Date.now() - Date.parse(last.captured)) / 3.6e6;
if (ageH < 12 && !force) { console.log(`Last capture is ${ageH.toFixed(1)} h old (${lastFile}). At most one every 12 hours; pass --force to override.`); process.exit(0); }

// Raw snapshot <-> plain showings.
const decode = (raw) => raw.rows.map(([id, start, minutes, hall, title, film, comp, flags]) => ({
  id, start, minutes, hall: raw.halls[hall], title: raw.titles[title],
  film: film >= 0 ? raw.films[film] : null, comp: comp >= 0 ? raw.films[comp] : null, flags,
}));
function encode(shows, captured, note) {
  shows.sort((a, b) => a.start - b.start || a.hall.localeCompare(b.hall));
  const halls = [...new Set(shows.map((s) => s.hall))].sort();
  const titles = [...new Set(shows.map((s) => s.title))];
  const ids = [...new Set(shows.flatMap((s) => [s.film?.[0], s.comp?.[0]].filter(Boolean)))];
  const meta = new Map(shows.flatMap((s) => [s.film, s.comp].filter(Boolean)).map((f) => [f[0], f]));
  const films = ids.map((id) => [id, shows.some((s) => s.comp?.[0] === id) ? "c" : "f", meta.get(id)[2] ?? ""]);
  const rows = shows.map((s) => [s.id, s.start, s.minutes, halls.indexOf(s.hall), titles.indexOf(s.title),
    s.film ? ids.indexOf(s.film[0]) : -1, s.comp ? ids.indexOf(s.comp[0]) : -1, s.flags]);
  return { captured, note, halls, titles, films, rows };
}

// Capture the remaining days in IDFA's own programme page.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
let fresh;
try {
  const page = await browser.newPage({ locale: "en-GB", timezoneId: "Europe/Amsterdam" });
  await page.goto("https://festival.idfa.nl/en/collectie/", { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForFunction(() => window.next?.router && document.getElementById("__next"), null, { timeout: 60_000 });
  await page.evaluate((d) => { window.__DAYS = d; }, days);
  const summary = await page.evaluate(readFileSync(new URL("scripts/capture-programme.js", root), "utf8"));
  console.log("captured:", JSON.stringify(summary));
  fresh = JSON.parse(await page.evaluate(() => window.__export));
} finally {
  await browser.close();
}

// Keep earlier screenings from the last snapshot; take everything from the cutoff on from the fresh capture.
const now = decode(fresh), before = decode(last);
const freshIds = new Set(now.map((s) => s.id));
const merged = [...now, ...before.filter((s) => s.start < cutoff && !freshIds.has(s.id))];

// Sanity check on the days that were reloaded.
const perDay = (list) => list.filter((s) => s.start >= cutoff).reduce((m, s) => { const d = Math.floor((s.start - CUTOFF_HOUR * 60) / DAY) + 12; m[d] = (m[d] ?? 0) + 1; return m; }, {});
const was = perDay(before), is = perDay(merged);
const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);
const problems = Object.keys(was).filter((d) => was[d] >= 20 && (is[d] ?? 0) < was[d] * 0.6).map((d) => `${d} Nov: ${was[d]} → ${is[d] ?? 0}`);
if (total(is) < total(was) * 0.85) problems.unshift(`remaining days: ${total(was)} → ${total(is)} showings`);
if (problems.length) {
  console.error("Refusing to save: too many screenings disappeared, which looks like a page change, not a programme change.\n  " + problems.join("\n  "));
  process.exit(1);
}

const out = `data-raw/idfa-${ymd}.json`;
writeFileSync(new URL(out, root), JSON.stringify(encode(merged, fresh.captured, fresh.note)));
console.log(`saved ${out}: ${merged.length} showings (${now.length} fresh from ${days[0]}, ${merged.length - now.length} kept from ${lastFile})`);
execFileSync(process.execPath, [new URL("scripts/build-programme.mjs", root).pathname, out], { cwd: root.pathname, stdio: "inherit" });
