/**
 * Usage events for the self-hosted, cookie-free stats at stats.arian-shafa.xyz (umami, loaded in index.html).
 * Only what was used, never content: no names, notes, search text, invite tokens or links.
 * Events from before the deferred stats script has loaded wait for it (up to 15 s).
 */
type Data = Record<string, string | number | boolean>;
type Umami = { track: (n: string, d?: Data) => void };
const waiting: [string, Data | undefined][] = [];
let polling = 0;
export function track(name: string, data?: Data) {
  const umami = (window as unknown as { umami?: Umami }).umami;
  try {
    if (umami) return umami.track(name, data);
    waiting.push([name, data]);
    if (!polling) polling = window.setInterval(() => {
      const u = (window as unknown as { umami?: Umami }).umami;
      if (u) waiting.splice(0).forEach(([n, d]) => u.track(n, d));
      if (u || performance.now() > 15000) { clearInterval(polling); polling = 0; waiting.length = 0; }
    }, 300);
  } catch { /* stats blocked */ }
}

/**
 * Names people typed (the group, members, crews, shot lists, notes) and their initials. The click tracker in index.html
 * labels a click with the button's text, so it blanks these out first: the stats never receive a name or a note.
 */
export function setPrivate(words: string[]) {
  const all = words.flatMap((w) => { const t = (w ?? "").trim(); return t.length > 1 ? [t, t.slice(0, 2).toUpperCase()] : []; });
  (window as unknown as { dhPrivate?: string[] }).dhPrivate = [...new Set(all)].sort((a, b) => b.length - a.length);
}
