import { Ship } from "lucide-react";
import { clock, DAY, dayInfo, span, type Item, type UiStop } from "../lib/catalogue";
import { analyse, legText } from "../lib/plan";

const PX = 1.6;

/** One festival day on a clock: each showing as a block at its fixed time, the walk between them, and clashes. */
export function Timeline({ stops, day, onPick, now }: { stops: UiStop[]; day: number; onPick: (e: Item) => void; now: number }) {
  const a = analyse(stops), slots = a.slots.filter((s) => s.day === day);
  if (!slots.length) return <p className="tl-empty">Nothing on {dayInfo(day).long} yet.</p>;
  const from = Math.floor((Math.min(...slots.map((s) => s.start)) - 30) / 60) * 60, to = Math.ceil((Math.max(...slots.map((s) => s.end)) + 30) / 60) * 60;
  const y = (n: number) => (Math.min(Math.max(n, from), to) - from) * PX;
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60);
  const walk = slots.reduce((n, s) => n + s.walk.minutes, 0), watch = slots.reduce((n, s) => n + s.item.minutes, 0);
  return <section className="timeline" aria-label={"Timeline of " + dayInfo(day).long}>
    <div className="tl-summary">
      <div><small>Watching</small><b>{span(watch)}</b><span>{slots.length} {slots.length === 1 ? "showing" : "showings"}</span></div>
      <div><small>Between cinemas</small><b>{walk} min</b><span>{(slots.reduce((n, s) => n + s.walk.metres, 0) / 1000).toFixed(1)} km</span></div>
      <div><small>Day ends</small><b>{clock(Math.max(...slots.map((s) => s.end)))}</b><span>{slots.at(-1)!.item.venue}</span></div>
    </div>
    <div className="tl-axis" style={{ height: (to - from) * PX }}>
      {hours.map((h) => <div key={h} className="tl-hour" style={{ top: y(h) }}><span>{clock(h)}</span></div>)}
      {now >= from && now <= to && Math.floor(now / DAY) === day && <div className="tl-now" style={{ top: y(now) }}><span>now</span></div>}
      {slots.map((s, i) => [
        i > 0 && s.walk.minutes > 0 && <div key={"w" + s.id} className={"tl-walk" + (s.clash || s.tight ? " tight" : "")} style={{ top: y(slots[i - 1].end), height: Math.max(s.walk.minutes * PX, 16) }}>
          <span>{s.walk.ferry && <Ship size={11} />}{s.clash ? "clash" : legText(s.walk)}{s.tight ? ` · ${s.gap} min` : ""}</span>
        </div>,
        <button key={s.id} className={"tl-block" + (s.clash ? " outside" : "") + (now >= s.end ? " seen" : "")} style={{ top: y(s.start), height: Math.max(s.item.minutes * PX, 40), left: s.clash ? 120 : 56 }} onClick={() => onPick(s.item)}>
          <b>{clock(s.start)} {s.item.title}</b>
          <small>{s.item.hall} · {span(s.item.minutes)}{s.item.english ? " · EN subs" : ""}</small>
        </button>,
      ])}
    </div>
    <p className="tl-note">Walking times come from routing on <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> data (© OpenStreetMap contributors) between cinemas, with a few minutes’ wait for the ferry across the IJ. They’re estimates, without queues: we count on being seated 5 minutes before the start.</p>
  </section>;
}
