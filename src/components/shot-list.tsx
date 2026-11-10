import { useState } from "react";
import { ArrowUpRight, CalendarPlus, Ship, X } from "lucide-react";
import { byId, clock, dayInfo, span, type Item, type UiStop } from "../lib/catalogue";
import { alternatives, analyse, legText, SEAT, toIcs, type Slot } from "../lib/plan";
import { removeOps } from "../lib/night";
import { newId, type Data, type Op, type Route } from "../lib/sync";
import type { Derived } from "../lib/night";
import { Legend, TicketChips, ticketOf, ticketSummary, type TicketStatus } from "./ticket-board";
import { track } from "../lib/track";

type Props = {
  stops: UiStop[]; day: number; route: Route | undefined; title: string; data: Data | undefined; night: Derived | null; userId: string;
  canEdit: boolean; now: number; run: (ops: Op[], label?: string) => void; onPick: (e: Item) => void; onTicket: (eventId: string, s: TicketStatus | null) => void;
  onStart: () => void; onDay: (d: number) => void; onExplore: () => void; onMap: () => void; toggle?: React.ReactNode;
};

/** Replaces one showing in a route with another (another showing of the same film), as one undoable change. */
export function swapOps(route: Route, stop: UiStop, to: Item): Op[] {
  if (!stop.rowId) return [];
  return [
    { t: "delete", table: "dh_stops", id: stop.rowId },
    { t: "insert", table: "dh_stops", row: { id: newId(), night_id: route.night_id, route_id: route.id, pos: stop.pos ?? 1, event_id: to.id, arrival: clock(to.start), duration: Math.max(1, Math.min(900, to.minutes)), reason: stop.reason ?? "", practical: "", transfer: "", fixed: true, maybe: !!stop.maybe, travel: stop.travel ?? null } },
  ];
}

/** The day's showings in time order, with the trip between them, clashes, the group's tickets and a leave-by time. */
export function ShotList({ stops, day, route, title, data, night, userId, canEdit, now, run, onPick, onTicket, onStart, onDay, onExplore, onMap, toggle }: Props) {
  const [fixing, setFixing] = useState<string | null>(null);
  const all = analyse(stops);
  const slots = all.slots.filter((s) => s.day === day);
  const info = dayInfo(day);
  const today = Math.floor(now / 1440) === day;
  const next = slots.find((s) => s.end > now) ?? (now < day * 1440 ? slots[0] : undefined);
  // The reminder: the first showing of the day that you marked "I want one" and haven't ticked as got yet. It comes from
  // your own ticket board, not from IDFA: DocuHop doesn't know whether tickets are left.
  const need = slots.find((s) => s.end > now && ticketOf(data, userId, s.id)?.status === "want");
  const counts = all.days.map((d) => ({ d, n: all.slots.filter((s) => s.day === d).length }));

  function download() {
    const url = URL.createObjectURL(new Blob([toIcs(stops, title)], { type: "text/calendar" }));
    Object.assign(document.createElement("a"), { href: url, download: "docuhop.ics" }).click();
    URL.revokeObjectURL(url);
    track("calendar-export", { stops: stops.length });
  }

  const fixList = (s: Slot) => {
    const alts = alternatives(stops, s.id).slice(0, 4);
    return <div className="fix-list" role="group" aria-label={"Other showings of " + s.item.title}>
      {!alts.length ? <p>No other showing of this film fits the rest of your plan. Remove one of the two, or check IDFA’s site for extra showings.</p>
        : <>{alts.map((a) => <div key={a.id} className="fix-row">
          <span><b>{dayInfo(a.day).weekday} {dayInfo(a.day).num} · {clock(a.start)}</b><small>{a.hall} · {span(a.minutes)}{a.english ? " · EN subs" : ""}</small></span>
          {canEdit && route && <button className="rx" onClick={() => { run(swapOps(route, s, a), `Swapped ${s.item.title} to ${dayInfo(a.day).weekday} ${clock(a.start)}`); setFixing(null); track("clash-fix"); }}>Swap</button>}
        </div>)}</>}
    </div>;
  };

  return <section className="shot-list" aria-label={title}>
    <div className="sl-head">
      <span className="eyebrow">{info.label.toUpperCase()} · {slots.length} {slots.length === 1 ? "FILM" : "FILMS"}</span>
      <h2 className="an">{title}</h2>
      {toggle}
    </div>
    {counts.length > 1 && <nav className="sl-days" aria-label="Days with plans">{counts.map(({ d, n }) => <button key={d} className={d === day ? "on" : ""} onClick={() => onDay(d)}>{dayInfo(d).weekday} {dayInfo(d).num}<b>{n}</b></button>)}</nav>}

    {need && night && (() => {
      const sum = ticketSummary(data, night, userId, need.id);
      return <div className="alert-card" role="status">
        <h3 className="an">You still want a ticket for {need.item.title}</h3>
        <p>{[...sum.got, ...sum.want].some((n) => n !== "You") ? sum.line : `${dayInfo(need.day).weekday} ${dayInfo(need.day).num} at ${clock(need.start)}, ${need.item.hall}.`} Tickets are sold on IDFA’s own site.</p>
        <div className="two"><a className="btn" href={need.item.url} target="_blank" rel="noreferrer" onClick={() => track("idfa-click")}>Tickets on IDFA<ArrowUpRight size={14} /></a>
          <button className="btn ghost" onClick={() => onTicket(need.id, "got")}>I’ve got mine</button></div>
      </div>;
    })()}

    {slots.length > 0 ? <>
      <div className="sl-legend"><Legend /><button className="text-link" onClick={onMap}>Map</button></div>
      <ol className="sl-rows">{slots.map((s, i) => {
        const seen = now >= s.end;
        return <li key={s.rowId ?? s.id}>
          {i > 0 && <div className={"sl-leg" + (s.clash || s.tight ? " bad" : "")}>
            {s.clash ? <span>Starts {s.gap! < 0 ? `${-s.gap!} min` : ""} before {slots[i - 1].item.title} ends</span>
              : s.tight ? <span>{legText(s.walk, slots[i - 1].item.venueId, s.item.venueId)}, only {s.gap} min between</span>
              : <span>{s.walk.ferry && <Ship size={12} />}{legText(s.walk, slots[i - 1].item.venueId, s.item.venueId)}{s.walk.minutes ? ` · leave by ${clock(s.leave!)}` : ""}</span>}
            {(s.clash || s.tight) && <button className="fix" aria-expanded={fixing === s.id} onClick={() => setFixing(fixing === s.id ? null : s.id)}>Fix</button>}
          </div>}
          {fixing === s.id && fixList(s)}
          <div className={"sl-row" + (seen ? " seen" : "") + (next?.id === s.id && today ? " next" : "")}>
            <span className="sl-time">{clock(s.start)}</span>
            <button className="sl-title" onClick={() => onPick(s.item)}><b>{s.item.title}</b><small>{s.item.hall} · {span(s.item.minutes)}{seen ? " · seen" : next?.id === s.id && today ? " · rolling next" : ""}</small></button>
            {canEdit && <button className="sl-remove" aria-label={"Remove " + s.item.title} onClick={() => run(removeOps(s), `Removed ${s.item.title}`)}><X size={14} /></button>}
            <div className="sl-chips"><TicketChips data={data} night={night} eventId={s.id} userId={userId} /></div>
          </div>
        </li>;
      })}</ol>
      {next && <p className="note-box"><b>Director’s note:</b> {(() => {
        const i = slots.indexOf(next), prev = slots[i - 1];
        return prev && next.leave != null ? `leave ${prev.item.venue} at ${clock(next.leave)} and you’re in your seat at ${next.item.venue} by ${clock(next.start - SEAT)}.`
          : `be at ${next.item.hall} by ${clock(next.start - SEAT)}. Doors usually open a little earlier.`;
      })()}</p>}
      <button className="btn big" onClick={onStart}>{today ? "START MY DAY" : `ROLL: GO TO ${(next?.item.venue ?? slots[0].item.venue).toUpperCase()}`}</button>
      <button className="text-button ics" onClick={download}><CalendarPlus size={14} />Add all {stops.length} to my calendar (.ics)</button>
    </> : <div className="sl-empty">
      <p>Nothing planned on {info.long} yet.</p>
      <button className="btn" onClick={onExplore}>Pick films for {info.weekday} {info.num}</button>
      {!!stops.length && <p className="sl-sub">{stops.length} {stops.length === 1 ? "showing" : "showings"} on other days: tap a day above.</p>}
    </div>}
  </section>;
}
