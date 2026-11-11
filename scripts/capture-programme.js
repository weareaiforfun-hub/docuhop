// Reads IDFA's public programme, facts only, from the programme page itself. Run it at most once or twice a day.
//
// How: open https://festival.idfa.nl/en/collectie/ in a browser, let it load, and run this whole file in that page's
// console (or with a browser tool's "run JavaScript"). It lets the page load each festival day the way a visitor's
// filter clicks would: 3 views per day (all public showings, New Media, English subtitles), 11 days, 3–4 seconds apart,
// about 2.5 minutes in all. It never calls IDFA's API itself, and stops if the page looks different from what it expects.
//
// It keeps only: show id (first 8 hex characters), start, length, hall, title, film or programme id, and three flags
// (1 English subtitles, 2 DocLab / New Media, 8 continuous). No ticket status or availability, no descriptions, stills,
// logos or credits. When it's done, window.__export holds the JSON; window.__chunk(0), (1), … return it in 20 KB pieces.
// Save it as data-raw/idfa-YYYY-MM-DD.json and run `npm run programme` (which refuses any row carrying ticket data).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // All 11 days, or only the ones scripts/refresh-idfa.mjs asks for (window.__DAYS), so past days aren't reloaded.
  const DAYS = window.__DAYS ?? Array.from({ length: 11 }, (_, i) => `2026-11-${String(12 + i).padStart(2, "0")}`);
  const T0 = Date.parse("2026-11-11T23:00:00Z"); // Thu 12 Nov 00:00 in Amsterdam (UTC+1)

  // The page's own data cache (React Query), found through React's tree.
  const rootEl = document.getElementById("__next");
  const key = rootEl && Object.keys(rootEl).find((k) => k.startsWith("__reactContainer") || k.startsWith("_reactRootContainer"));
  let fiber = key && rootEl[key]; if (fiber?.current) fiber = fiber.current; if (fiber?._internalRoot) fiber = fiber._internalRoot.current;
  let qc = null;
  for (const stack = [fiber], seen = { n: 0 }; stack.length && !qc && seen.n < 200000; seen.n++) {
    const f = stack.pop(); if (!f) continue;
    if (f.memoizedProps?.client?.getQueryCache) qc = f.memoizedProps.client;
    if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child);
  }
  if (!qc || !window.next?.router) throw new Error("This doesn't look like IDFA's programme page (no data cache or router). Stopped.");

  const hitsFor = (filters) => {
    const q = qc.getQueryCache().getAll().find((q) => q.queryKey[0] === "searchScheduleHits"
      && JSON.stringify(q.queryKey[1].filters.map((f) => f.key + ":" + f.value.join("|")).sort()) === JSON.stringify(filters.slice().sort()));
    return q?.state.data ? q.state.data.searchSchedule.hits : null;
  };
  const load = async (url, filters) => { await window.next.router.push(url); for (let i = 0; i < 20; i++) { await sleep(500); const h = hitsFor(filters); if (h) return h; } return null; };

  const shows = {}, links = {}, en = {}, nm = {}, report = {};
  for (const day of DAYS) {
    const base = "/en/collectie/?DAY=" + day;
    const all = await load(base + "&SHOW_TYPE=Public&SHOW_TYPE=New+Media", ["DAY:" + day, "SHOW_TYPE:Public|New Media"]);
    if (!all) throw new Error(day + ": the programme didn't load. Stopped; nothing exported.");
    await sleep(1500);
    document.querySelectorAll('a[href*="/en/film/"], a[href*="/en/composition/"]').forEach((a) => {
      const m = a.getAttribute("href").match(/\/en\/(film|composition)\/([0-9a-f-]{36})\//); if (m) links[m[2]] = a.getAttribute("href");
    });
    // Facts only. Ticket fields on the page's data are deliberately not read.
    for (const h of all) shows[h.id] = { id: h.id, title: h.fullTitle, start: h.startOn, end: h.endOn, hall: h.location, ongoing: !!h.isOngoingProgram,
      audience: h.audience?.key, film: h.film?.id ?? null, comp: h.composition?.id ?? null };
    await sleep(3000);
    (await load(base + "&SHOW_TYPE=New+Media", ["DAY:" + day, "SHOW_TYPE:New Media"]) ?? []).forEach((h) => (nm[h.id] = 1));
    await sleep(3000);
    (await load(base + "&SHOW_TYPE=Public&SHOW_TYPE=New+Media&ACCESSIBILITY=Film+fully+subtitled+in+English",
      ["ACCESSIBILITY:Film fully subtitled in English", "DAY:" + day, "SHOW_TYPE:Public|New Media"]) ?? []).forEach((h) => (en[h.id] = 1));
    report[day] = all.length;
    await sleep(3000);
  }

  const S = Object.values(shows).filter((s) => s.audience === "Public" || s.audience === "NotSet")
    .sort((a, b) => a.start.localeCompare(b.start) || a.hall.localeCompare(b.hall));
  const halls = [...new Set(S.map((s) => s.hall))].sort();
  const titles = [...new Set(S.map((s) => s.title.trim()))];
  const filmIds = [...new Set(S.flatMap((s) => [s.film, s.comp].filter(Boolean)))];
  const rows = S.map((s) => [s.id.slice(0, 8), Math.round((Date.parse(s.start) - T0) / 60000), Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60000),
    halls.indexOf(s.hall), titles.indexOf(s.title.trim()), s.film ? filmIds.indexOf(s.film) : -1, s.comp ? filmIds.indexOf(s.comp) : -1,
    (en[s.id] ? 1 : 0) | (nm[s.id] ? 2 : 0) | (s.ongoing ? 8 : 0)]);
  const films = filmIds.map((id) => [id, S.some((s) => s.comp === id) ? "c" : "f", links[id]?.split("/")[4] ?? ""]);
  window.__export = JSON.stringify({ captured: new Date().toISOString(),
    note: "Facts only: show id, start, length, hall, title, film/programme id, flags (1 English subtitles, 2 DocLab, 8 continuous). No ticket status.",
    halls, titles, films, rows });
  window.__chunk = (i) => window.__export.slice(i * 20000, (i + 1) * 20000);
  return { showings: rows.length, perDay: report, size: window.__export.length, chunks: Math.ceil(window.__export.length / 20000) };
})();
