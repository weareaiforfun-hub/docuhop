import { ArrowUpRight, Check } from "lucide-react";
import { byId, dayInfo, DAYS, type Item } from "../lib/catalogue";
import type { Derived } from "../lib/night";
import { newId, type Data, type Op, type TicketRow } from "../lib/sync";

/* The group ticket board (board 36): for each showing the group is looking at, who has a ticket, who wants one and
   who skips it. This is the group's own data: everyone ticks their own row. Tickets are bought on IDFA's site (each row
   links to the film's official page). DocuHop never sells tickets, never touches MyIDFA and doesn't know what's left. */

export type TicketStatus = TicketRow["status"];
export const TSTATUS: { key: TicketStatus; label: string; short: string; cls: string }[] = [
  { key: "got", label: "Got a ticket", short: "Got it", cls: "g" },
  { key: "want", label: "Wants one", short: "Wants", cls: "y" },
  { key: "skip", label: "Skips it", short: "Skip", cls: "n" },
];

const letter = (name: string) => name.trim().charAt(0).toUpperCase() || "?";
const real = (night: Derived) => night.members.filter((m) => !m.fictional);
export const ticketOf = (data: Data | undefined, uid: string, eventId: string) => data?.dh_tickets.find((t) => t.user_id === uid && t.event_id === eventId);

/** Ops that set (or with null, clear) my ticket status for a showing. */
export function ticketOps(data: Data, nightId: string, uid: string, eventId: string, status: TicketStatus | null): Op[] {
  const mine = ticketOf(data, uid, eventId);
  if (!status) return mine ? [{ t: "delete", table: "dh_tickets", id: mine.id }] : [];
  return mine ? [{ t: "update", table: "dh_tickets", id: mine.id, patch: { status, updated_at: new Date().toISOString() } }]
    : [{ t: "insert", table: "dh_tickets", row: { id: newId(), night_id: nightId, user_id: uid, event_id: eventId, status } }];
}

/** "You, Noor and Mila" */
export const names = (list: string[]) => list.length <= 1 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list.at(-1);
/** Who has a ticket and who still wants one, for one showing, worded for people. */
export function ticketSummary(data: Data | undefined, night: Derived | null, userId: string, eventId: string) {
  if (!data || !night) return { got: [] as string[], want: [] as string[], line: "" };
  const who = (uid: string) => (uid === userId ? "You" : night.memberOf.get(uid)?.display_name ?? "Someone");
  const rows = data.dh_tickets.filter((t) => t.event_id === eventId && night.memberOf.has(t.user_id));
  const got = rows.filter((t) => t.status === "got").map((t) => who(t.user_id)).sort((a) => (a === "You" ? -1 : 0));
  const want = rows.filter((t) => t.status === "want").map((t) => who(t.user_id)).sort((a) => (a === "You" ? -1 : 0));
  const line = [got.length ? `${names(got)} ${got.length === 1 && got[0] !== "You" ? "has a ticket" : "have tickets"}.` : "",
    want.length ? `${names(want)} ${want.length === 1 && want[0] !== "You" ? "doesn’t" : "don’t"} yet.` : ""].filter(Boolean).join(" ");
  return { got, want, line };
}

/** One letter per person, coloured by their status: green has a ticket, yellow wants one, grey skips. */
export function TicketChips({ data, night, eventId, userId }: { data: Data | undefined; night: Derived | null; eventId: string; userId: string }) {
  if (!data || !night) return null;
  const people = real(night);
  if (people.length < 2) {
    const mine = ticketOf(data, userId, eventId);
    return mine ? <span className={"sq-row solo"}><span className={"sq " + TSTATUS.find((s) => s.key === mine.status)!.cls}>{letter(night.me?.display_name ?? "?")}</span><small>{TSTATUS.find((s) => s.key === mine.status)!.label}</small></span> : null;
  }
  return <span className="sq-row" aria-label="Who has a ticket">{people.map((m) => {
    const t = ticketOf(data, m.user_id, eventId), s = TSTATUS.find((x) => x.key === t?.status);
    return <span key={m.user_id} className={"sq " + (s?.cls ?? "none")} title={`${m.user_id === userId ? "You" : m.display_name}: ${s?.label ?? "not said"}`}>{letter(m.display_name)}</span>;
  })}</span>;
}

/** My own three buttons: Got it / Want one / Skip. Pressing the active one clears it. */
export function TicketButtons({ value, onChange, title, big }: { value: TicketStatus | undefined; onChange: (s: TicketStatus | null) => void; title: string; big?: boolean }) {
  return <div className={"ticket-buttons" + (big ? " big" : "")} role="group" aria-label={"Your ticket for " + title}>
    {TSTATUS.map((s) => <button key={s.key} className={"tb-" + s.key + (value === s.key ? " on" : "")} aria-pressed={value === s.key} onClick={() => onChange(value === s.key ? null : s.key)}>
      {value === s.key && <Check size={13} />}{s.key === "got" ? "I’ve got mine" : s.key === "want" ? "I want one" : "Skip"}</button>)}
  </div>;
}

export function Legend() {
  return <div className="legend"><span className="sq g">A</span>has a ticket<span className="sq y">N</span>wants one<span className="sq n">S</span>skip</div>;
}

/** The board: rows are showings (the group's shot list plus anything someone set a status on), columns are people. */
export function TicketBoard({ data, night, userId, rows, onPick, onSet, canWrite }: {
  data: Data; night: Derived; userId: string; rows: Item[]; onPick: (e: Item) => void; onSet: (eventId: string, s: TicketStatus | null) => void; canWrite: boolean;
}) {
  const people = real(night);
  const cycle = (cur: TicketStatus | undefined): TicketStatus | null => (cur === undefined ? "want" : cur === "want" ? "got" : cur === "got" ? "skip" : null);
  if (!rows.length) return <p className="board-empty">Add showings to the group’s shot list, or tick “I want one” on any showing, and they show up here.</p>;
  return <div className="ticket-board" role="table" aria-label="Ticket board" style={{ ["--cols" as string]: people.length }}>
    <div className="tb-row tb-head" role="row">
      <span role="columnheader">Showing</span>
      {people.map((m) => <span key={m.user_id} role="columnheader" className="tb-person" title={m.display_name}><i className="avatar" style={{ background: m.color }}>{letter(m.display_name)}</i></span>)}
      <span role="columnheader" className="tb-idfa">Buy</span>
    </div>
    {rows.map((e) => <div className="tb-row" role="row" key={e.id}>
      <button className="tb-title" role="rowheader" onClick={() => onPick(e)}><b>{e.title}</b><small>{dayInfo(e.day).weekday} {dayInfo(e.day).num} · {e.time.split(" – ")[0]} · {e.venue}</small></button>
      {people.map((m) => {
        const t = ticketOf(data, m.user_id, e.id), s = TSTATUS.find((x) => x.key === t?.status), mine = m.user_id === userId;
        return mine && canWrite
          ? <button key={m.user_id} role="cell" className={"tb-cell mine " + (s?.cls ?? "none")} aria-label={`Your ticket for ${e.title}: ${s?.label ?? "not said"}. Change`} onClick={() => onSet(e.id, cycle(t?.status))}>{s?.short ?? "Set"}</button>
          : <span key={m.user_id} role="cell" className={"tb-cell " + (s?.cls ?? "none")} title={`${m.display_name}: ${s?.label ?? "not said"}`}>{s?.short ?? "–"}</span>;
      })}
      <a role="cell" className="tb-idfa" href={e.url} target="_blank" rel="noreferrer" aria-label={"Tickets on IDFA for " + e.title} title="Tickets on IDFA’s site">IDFA<ArrowUpRight size={12} /></a>
    </div>)}
  </div>;
}

/** "When is everyone free?": people × festival days. Your own row is yours to tap. */
export function FreeGrid({ data, night, userId, canWrite, days, onToggle, wanted, onPickDay }: {
  data: Data; night: Derived; userId: string; canWrite: boolean; days: number[]; onToggle: (day: number, free: boolean) => void; wanted: Item[]; onPickDay: (day: number) => void;
}) {
  const people = real(night);
  const free = (uid: string, d: number) => data.dh_free.some((f) => f.user_id === uid && f.day === d);
  const all = days.filter((d) => people.length > 0 && people.every((m) => free(m.user_id, d)));
  const best = all[0] ?? [...days].sort((a, b) => people.filter((m) => free(m.user_id, b)).length - people.filter((m) => free(m.user_id, a)).length)[0];
  const bestCount = best != null ? people.filter((m) => free(m.user_id, best)).length : 0;
  const titles = new Set(wanted.map((e) => e.film));
  const onBest = best != null ? byFilmOnDay(titles, best) : 0;
  const anyone = data.dh_free.length > 0;
  return <div className="free-grid-wrap">
    <div className="free-grid" role="table" aria-label="When is everyone free" style={{ ["--days" as string]: days.length }}>
      <div className="fg-row fg-head" role="row"><span />{days.map((d) => <span key={d} role="columnheader" className={best === d && bestCount > 0 ? "best" : ""}><b>{dayInfo(d).letter}</b>{dayInfo(d).num}</span>)}</div>
      {people.map((m) => <div className="fg-row" role="row" key={m.user_id}>
        <span role="rowheader" className="fg-name">{m.user_id === userId ? "You" : m.display_name}</span>
        {days.map((d) => {
          const on = free(m.user_id, d), mine = m.user_id === userId && canWrite;
          return mine ? <button key={d} role="cell" className={"fg-cell mine" + (on ? " on" : "") + (best === d && bestCount > 0 ? " best" : "")} aria-pressed={on} aria-label={`${dayInfo(d).long}: ${on ? "free" : "not free"}`} onClick={() => onToggle(d, !on)} />
            : <span key={d} role="cell" className={"fg-cell" + (on ? " on" : "") + (best === d && bestCount > 0 ? " best" : "")} title={`${m.display_name}, ${dayInfo(d).label}: ${on ? "free" : "not said"}`} />;
        })}
      </div>)}
    </div>
    {canWrite && <p className="fg-help">Tap the days in your row when you’re free.</p>}
    {anyone && best != null && bestCount > 0 && <div className="fg-verdict">
      <p>{all.length ? <><b>✓ {dayInfo(best).long.split(" ")[0]} works for {people.length === 1 ? "you" : people.length === 2 ? "both of you" : `all ${people.length}`}.</b></> : <><b>{dayInfo(best).long.split(" ")[0]} works for {bestCount} of {people.length}.</b></>}
        {titles.size > 0 && ` ${onBest} of the ${titles.size} ${titles.size === 1 ? "film" : "films"} your group wants ${onBest === 1 ? "has a showing" : "have showings"} that day.`}</p>
      <button className="btn" onClick={() => onPickDay(best)}>Pick a showing<ArrowUpRight size={15} /></button>
    </div>}
  </div>;
}

function byFilmOnDay(films: Set<string>, day: number) {
  let n = 0;
  for (const f of films) if ([...byId.values()].some((e) => e.film === f && e.day === day)) n++;
  return n;
}

/** The days the board shows: from today (or the first day) to the end of the festival. */
export const remainingDays = (today: number | null) => DAYS.map((_, i) => i).filter((d) => d >= (today ?? 0));
