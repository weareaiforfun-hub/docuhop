import { useEffect, useMemo, useState } from "react";
import { Eye, Footprints, Film } from "lucide-react";
import { clock, dayInfo, span, type UiStop } from "../lib/catalogue";
import { analyse, legText } from "../lib/plan";
import { sync, type ViewNight as Night } from "../lib/sync";
import { MapView } from "./map-view";
import { SiteNote } from "./help";

/** What someone with a view-only link sees: the group's routes on a map and as a list, refreshed every 30 seconds.
 *  No sign-in, no names; nothing here can change the group. */
export function ViewNight({ token }: { token: string }) {
  const [night, setNight] = useState<Night | null | undefined>(undefined), [error, setError] = useState("");
  const [which, setWhich] = useState(0), [fit, setFit] = useState(1);

  useEffect(() => {
    let alive = true;
    const load = () => sync?.viewNight(token).then((n) => { if (alive) { setNight(n); setError(""); } }).catch((e) => alive && setError(e.message));
    load();
    const timer = setInterval(load, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [token]);

  const route = night?.routes[Math.min(which, night.routes.length - 1)];
  const stops: UiStop[] = useMemo(() => route?.stops.map((s) => ({ id: s.event_id, arrival: s.arrival, duration: s.duration, maybe: s.maybe, fixed: s.fixed })) ?? [], [route]);
  const lines = useMemo(() => (route ? [{ stops, color: route.color, numbered: true }] : []), [route, stops]);
  useEffect(() => setFit((f) => f + 1), [which, night === undefined]);

  return <main className="view-night">
    <header className="topbar">
      <a href="./" className="brand an" aria-label="DocuHop home">DOCUHOP<small>IDFA<br />12–22 Nov</small></a>
      <span className="chip"><Eye size={14} />VIEW ONLY</span>
    </header>
    {night === undefined && !error ? <p className="view-message">Loading the group…</p>
      : error ? <p className="view-message" role="alert">{error}</p>
      : !night ? <div className="view-message"><h1>This link doesn’t work anymore</h1><p>The group turned it off or made a new one. Ask them for the current view-only link.</p><a className="primary" href="./">Plan your own group</a></div>
      : <div className="view-body">
        <section className="view-map map-panel" aria-label="Map of the shot list"><MapView visible={[]} lines={lines} onSelect={(e) => window.open(e.url, "_blank", "noopener")} focus={null} fit={fit} /></section>
        <aside className="view-list">
          <span className="eyebrow">SHARED WITH YOU</span>
          {night.routes.length > 1 && <nav className="itinerary-tabs view-tabs" aria-label="Routes">{night.routes.map((r, i) => <button key={r.title + i} className={i === which ? "active" : ""} onClick={() => setWhich(i)}>{r.title}</button>)}</nav>}
          <h1 className="an">{(route?.title ?? "Our shot list").replace("Our route", "Our shot list").replace("’s route", "’s shot list").toUpperCase()}</h1>
          {!stops.length ? <p className="view-empty">No films yet. This page updates by itself when the group adds some.</p>
            : <ol className="view-stops">{analyse(stops).slots.map((s, i, all) => {
              const e = s.item, newDay = i === 0 || all[i - 1].day !== s.day;
              return <li key={s.id + i}>
                {newDay && <h3 className="view-day">{dayInfo(s.day).long}</h3>}
                {!newDay && s.walk.minutes > 0 && <small className="view-walk"><Footprints size={11} />{legText(s.walk)}</small>}
                <div className="view-stop"><span className="sl-time">{clock(s.start)}</span><div>
                  <a href={e.url} target="_blank" rel="noreferrer"><b>{e.title}</b></a>
                  <p>{e.hall} · {span(e.minutes)}</p>
                </div></div>
              </li>;
            })}</ol>}
          <p className="view-foot"><Film size={13} />Updates by itself as the group changes the plan. Want to help plan? Ask the group for their invite link.</p>
          <p className="view-foot"><a href="./">Plan your own IDFA with DocuHop</a></p>
          <SiteNote />
        </aside>
      </div>}
  </main>;
}
