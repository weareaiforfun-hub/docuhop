import { useEffect, useState } from "react";
import { Accessibility, ArrowUpRight, Captions } from "lucide-react";
import { byVenue, dayInfo, isVenue, span, type Item } from "../lib/catalogue";
import { liveStatus, walkFrom, type Spot } from "../lib/location";

/** The current time, ticking every 30 seconds so live statuses stay right while the window is open. */
export function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  return now;
}

/** When and where, and IDFA's own page, for the details sheet. Facts only: no descriptions, no ticket status. */
export function ActivityInfo({ item, me }: { item: Item; me: Spot | null }) {
  const now = useMinute(), v = byVenue.get(item.venueId), venue = isVenue(item.id);
  const status = venue ? null : liveStatus(item, now), walk = me ? walkFrom(me, item.venueId) : null;
  return <>
    <div className="detail-cards">
      {!venue && <div className="detail-card"><span className="eyebrow">WHEN</span>
        <b>{dayInfo(item.day).label} · {item.time}</b>
        {status ? <small className={"live-" + status.tone}>{status.tone === "on" && "● "}{status.text}</small> : <small>{span(item.minutes)}</small>}
      </div>}
      <div className="detail-card"><span className="eyebrow">WHERE</span>
        <b>{venue ? v?.name : item.hall}</b>
        <small>{v?.address}{walk && walk.metres < 15000 ? ` · ${walk.minutes} min walk from you${walk.ferry ? ", ferry included" : ""}` : ""}</small>
      </div>
    </div>
    {!venue && (item.english || item.doclab || item.continuous) && <div className="detail-labels">
      {item.english && <span><Captions size={12} />Fully subtitled in English</span>}
      {item.doclab && <span>DocLab</span>}
      {item.continuous && <span>Walk-in programme</span>}
    </div>}
    {v && <div className={"detail-access" + (v.stepFree ? "" : " unlisted")}><Accessibility size={16} /><p><b>{v.stepFree ? "Wheelchair accessible" : v.stepFree === false ? "Not step-free" : "Access not listed yet"}</b>{v.stepFree ? " according to IDFA’s venue page. Single halls can differ." : v.stepFree === false ? " according to IDFA’s venue page." : " on IDFA’s venue page."} Check the venue page for details.</p></div>}
    {venue && <a className="official-detail" href={item.url} target="_blank" rel="noreferrer"><span>Venue page on IDFA’s site</span><ArrowUpRight size={16} /></a>}
    {!venue && <p className="detail-help">Times can change: always check the official page. DocuHop doesn’t know whether tickets are left.</p>}
  </>;
}
