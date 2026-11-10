import { useEffect, useState } from "react";
import { ArrowUpRight, Undo2 } from "lucide-react";
import { clock, dayInfo, span, type Item, type UiStop } from "../lib/catalogue";
import { analyse, legText, SEAT, venueLeg } from "../lib/plan";
import { festivalMinute, mapsNext, walkFrom, type Spot } from "../lib/location";
import type { Data } from "../lib/sync";
import type { Derived } from "../lib/night";
import { ticketOf } from "./ticket-board";
import { track } from "../lib/track";

const KEY = "dh:skipped";
const loadSkipped = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };

/** The REC clock: festival time to the second. */
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

/** On the day: the next showing, how far it is, when to leave, and one big button. */
export function NowView({ stops, me, data, night, userId, onPick, onClose, onDay }: {
  stops: UiStop[]; me: Spot | null; data: Data | undefined; night: Derived | null; userId: string; onPick: (e: Item) => void; onClose: () => void; onDay: (d: number) => void;
}) {
  const clockNow = useClock(), at = festivalMinute(clockNow);
  const [skipped, setSkipped] = useState<string[]>(loadSkipped), [here, setHere] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(skipped)); } catch { /* private mode */ } }, [skipped]);
  const slots = analyse(stops).slots.filter((s) => !skipped.includes(s.id));
  const i = slots.findIndex((s) => s.end > at && s.id !== here);
  const cur = slots[i], after = slots[i + 1]?.day === cur?.day ? slots[i + 1] : undefined, prev = i > 0 && slots[i - 1].day === cur?.day ? slots[i - 1] : undefined;
  const time = clockNow.toLocaleTimeString("en-GB", { timeZone: "Europe/Amsterdam", hour12: false });

  if (!cur) {
    const later = slots.find((s) => s.start > at);
    return <section className="now-view" aria-label="Now">
      <div className="rec-bar"><span><i className="rec-dot" />REC</span><span>{time}</span></div>
      <h2 className="an">That’s a wrap.</h2>
      <p>{later ? `Your next showing is on ${dayInfo(later.day).long}: ${later.item.title} at ${clock(later.start)}.` : "Nothing else in your shot list. Add films in Programme."}</p>
      {later && <button className="btn" onClick={() => onDay(later.day)}>See {dayInfo(later.day).weekday} {dayInfo(later.day).num}</button>}
      {skipped.length > 0 && <button className="text-button" onClick={() => setSkipped([])}><Undo2 size={14} />Bring back {skipped.length} skipped</button>}
      <button className="text-button" onClick={onClose}>Back to my shot list</button>
    </section>;
  }
  const fromMe = me ? walkFrom(me, cur.item.venueId) : null;
  const fromPrev = prev && at >= prev.start ? venueLeg(prev.item.venueId, cur.item.venueId) : null;
  const walk = fromMe && fromMe.metres < 15000 ? { minutes: fromMe.minutes, ferry: fromMe.ferry, from: "you" } : fromPrev ? { minutes: fromPrev.minutes, ferry: fromPrev.ferry, from: prev!.item.venue } : null;
  const seatBy = cur.start - SEAT, leaveAt = walk ? seatBy - walk.minutes : null;
  const rolling = at >= cur.start, mine = ticketOf(data, userId, cur.id)?.status;
  const big = rolling ? `Rolling · ends ${clock(cur.end)}` : leaveAt == null ? `Be there by ${clock(seatBy)}` : leaveAt - at > 90 ? `Leave at ${clock(leaveAt)}` : leaveAt > at ? `Leave in ${leaveAt - at} min` : at < cur.start ? "Leave now" : "Rolling";
  const url = mapsNext(cur);
  return <section className="now-view" aria-label="Now">
    <div className="rec-bar"><span><i className="rec-dot" />REC</span><span>{time}</span></div>
    <span className="eyebrow y">{rolling ? "ROLLING NOW" : "ROLLING NEXT"} · {clock(cur.start)}{cur.day !== Math.floor(at / 1440) ? " · " + dayInfo(cur.day).label.toUpperCase() : ""}</span>
    <button className="now-title an" onClick={() => onPick(cur.item)}>{cur.item.title}</button>
    <p className="now-sub">{cur.item.hall} · {span(cur.item.minutes)}{mine === "got" ? " · you have a ticket" : mine === "want" ? " · you still need a ticket" : ""}</p>
    {night && night.members.filter((m) => !m.fictional).length > 1 && <p className="now-group">{night.members.filter((m) => !m.fictional && m.user_id !== userId).map((m) => `${m.display_name}: ${({ got: "has a ticket", want: "wants one", skip: "skips it" } as Record<string, string>)[ticketOf(data, m.user_id, cur.id)?.status ?? ""] ?? "not said"}`).join(" · ")}</p>}
    <p className="leave an" aria-live="polite">{big}</p>
    {!rolling && <p className="now-sub">{walk ? `${legText({ minutes: walk.minutes, ferry: walk.ferry, mode: "foot" })} from ${walk.from} · ` : "Turn on your location for a walking time · "}in your seat by {clock(seatBy)}</p>}
    {url && <a className="btn big walk" href={url} target="_blank" rel="noreferrer" onClick={() => track("google-maps", { kind: "now" })}>WALK THERE<ArrowUpRight size={16} /></a>}
    <div className="two">
      <button className="btn ghost big" onClick={() => { setHere(cur.id); track("now-here"); }}>I’M HERE</button>
      <button className="btn ghost big" onClick={() => { setSkipped([...skipped, cur.id]); track("now-skip"); }}>SKIP</button>
    </div>
    {after && <p className="sub-line an">[after this] {after.item.title} · {after.item.venue} · {clock(after.start)}<br />{legText(after.walk, cur.item.venueId, after.item.venueId)}</p>}
    {here && <button className="text-button" onClick={() => setHere(null)}><Undo2 size={14} />Back to {slots.find((s) => s.id === here)?.item.title}</button>}
    <button className="text-button" onClick={onClose}>Full shot list</button>
  </section>;
}
