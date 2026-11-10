import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { track } from "../lib/track";
import { ArrowLeft, ArrowRight, Mail, X } from "lucide-react";
import { CAPTURED } from "../lib/catalogue";

/** Problems and ideas go straight to the developer. The address in the link never includes invite or personal links. */
export const CONTACT_EMAIL = "arian.shafa.analytics@gmail.com";
export const CONTACT = "mailto:" + CONTACT_EMAIL + "?subject=" + encodeURIComponent("DocuHop: a problem or an idea")
  + "&body=" + encodeURIComponent("What happened, or what would you like?\n\n\nPhone or computer, and which browser:\n");
export const MAKER = "https://arian-shafa.xyz";
export const UNOFFICIAL = "Unofficial fan planner, not affiliated with IDFA.";
export const CHECK = "Times can change: always check the official page.";
/** Where the times come from: IDFA's public programme. */
export const SOURCE = "https://festival.idfa.nl/en/collectie/";
export const checkedAt = () => new Date(CAPTURED).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

/** The line every page carries: unofficial, times can change, where the times come from, and how to reach the maker. */
export function SiteNote({ onData, className = "" }: { onData?: () => void; className?: string }) {
  return <footer className={"data-note " + className}>
    <b>{UNOFFICIAL}</b> {CHECK}<br />
    Times from IDFA’s public programme on <a className="footer-link" href={SOURCE} target="_blank" rel="noreferrer">idfa.nl</a>, last checked {checkedAt()}.
    Contact: <a className="footer-link" href={CONTACT}>{CONTACT_EMAIL}</a><br />
    {onData && <><button className="footer-link footer-data" onClick={onData}>Your data</button> · </>}<a className="footer-link" href={MAKER} target="_blank" rel="noopener">A project by Arian Shafa ↗</a>
  </footer>;
}

/** Which part of the app a spotlight step needs on screen (phones show one tab at a time). */
export type Place = { tab?: "discover" | "day" | "crew"; crew?: "board" | "decide" | "ideas" | "crews" | "activity" };
type Spot = Place & { target: string; title: string; body: string };

const SEEN = "dh:intro-seen";
export const introSeen = () => { try { return !!localStorage.getItem(SEEN); } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN, "1"); } catch { /* private mode */ } };

/** The optional tour: four steps, each pointing at the real screen (board 64). */
const TOUR: Spot[] = [
  { tab: "discover", target: ".day-strip", title: "Pick a day", body: "Eleven festival days, Thu 12 to Sun 22 Nov. Each day lists its showings with times, halls and English subtitles." },
  { tab: "discover", target: ".map-panel", title: "The map is the plan", body: "Every cinema is a dot. Your films show up as name labels, joined by the walk between them. The free ferry to Eye is on it too." },
  { tab: "discover", target: ".pg-row .add-button", title: "Add a film", body: "+ puts a showing in your shot list. There you see the walk to the next cinema, clashes, and when to leave." },
  { tab: "crew", target: ".tab-crew, .crew-tab", title: "Bring your friends", body: "Invite your group with one link. The ticket board shows who has a ticket and who still needs one, and the grid finds the day everyone is free." },
];

type Feature = Spot & { needsNight?: boolean; group: string };
/** Every MuseumHop function, as it works here (board 63). `needsNight` ones only exist once you're in a group. */
const FEATURES: Feature[] = [
  { group: "FIND", tab: "discover", target: ".filters", title: "Search and filters", body: "English subtitles, DocLab, step-free, cinema, start time and your friends’ picks" },
  { group: "FIND", tab: "discover", target: ".map-panel", title: "The map", body: "Every cinema, your films, where you are, Getting around" },
  { group: "FIND", tab: "discover", target: ".pg-row .pg-title", title: "Details and IDFA’s page", body: "Time, hall, the film’s other showings, and a link to the film’s page on IDFA’s site, where tickets are sold" },
  { group: "FIND", tab: "discover", target: ".ideas-button", title: "Shot list ideas", body: "Ready-made days: one cinema, across the IJ, DocLab, Leidseplein" },
  { group: "PLAN", tab: "day", target: ".shot-list", title: "Your shot list", body: "Films in order, with walking minutes between them" },
  { group: "PLAN", tab: "day", target: ".sl-rows, .shot-list", title: "Clashes and leave-by times", body: "So you’re seated before the lights go down. Fix swaps to another showing that fits" },
  { group: "PLAN", tab: "day", target: ".view-toggle", title: "Timeline", body: "The day on a clock, with every walk and gap, and a calendar file" },
  { group: "TOGETHER", target: ".invite-button", title: "Invite and share", body: "One link for your group, or a view-only link" },
  { group: "TOGETHER", tab: "crew", crew: "decide", target: ".crew-nav", needsNight: true, title: "Picks and Decide", body: "Must-see, Up for it, Skip, then decide together" },
  { group: "TOGETHER", tab: "crew", crew: "crews", target: ".crew-nav", needsNight: true, title: "Crews", body: "Split up and meet again, with “We’re here”" },
  { group: "TOGETHER", tab: "crew", crew: "activity", target: ".crew-nav", needsNight: true, title: "Live changes and undo", body: "Who changed what, and undo for your own changes" },
  { group: "ON THE DAY", tab: "day", target: ".start-day, .shot-list", title: "Next film", body: "Go, Google Maps, and a countdown to leave" },
  { group: "ON THE DAY", target: ".locate-button", title: "Show my location", body: "A blue dot and walking times from where you are. It stays on your phone" },
  { group: "ON THE DAY", target: ".rides-button", title: "Getting around", body: "The free IJ ferry, metro 52 and tram 26 for the far cinemas" },
  { group: "YOU", target: ".link-button", needsNight: true, title: "Keep your spot", body: "A personal link, no account, works on any device" },
  { group: "YOU", target: ".footer-data", title: "Your data", body: "What’s kept, who sees it, and when it’s deleted" },
];
const GROUPS = Array.from(new Set(FEATURES.map((f) => f.group)));
const NEW = [
  { title: "Who has a ticket", body: "Your group’s ticket board: got it, wants one, skip" },
  { title: "When everyone is free", body: "Eleven festival days. Find the one that works" },
  { title: "Eleven days, fixed times", body: "Films start on time, so we tell you when to leave" },
  { title: "Clash? Fix it", body: "Swap a film to another showing that fits your day" },
];

/** Step through slides by swiping or scrolling (wheel or trackpad), on top of the buttons and arrow keys. One gesture
 *  moves one step: a trackpad's long scroll is ignored until it has stopped. */
function useFlip(onNext?: () => void, onBack?: () => void) {
  const g = useRef({ sum: 0, locked: false, timer: 0, x: 0, y: 0, swiped: false });
  const flip = (forward: boolean) => { (forward ? onNext : onBack)?.(); };
  return {
    onWheel(e: React.WheelEvent) {
      const s = g.current, d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      clearTimeout(s.timer);
      s.timer = window.setTimeout(() => { s.locked = false; s.sum = 0; }, 220);
      if (s.locked) return;
      s.sum += d;
      if (Math.abs(s.sum) > 50) { s.locked = true; flip(s.sum > 0); }
    },
    onTouchStart(e: React.TouchEvent) { g.current.x = e.touches[0].clientX; g.current.y = e.touches[0].clientY; g.current.swiped = false; },
    onTouchEnd(e: React.TouchEvent) {
      const t = e.changedTouches[0], dx = t.clientX - g.current.x, dy = t.clientY - g.current.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
      g.current.swiped = true; // not a tap: don't let it close anything
      flip(Math.abs(dx) > Math.abs(dy) ? dx < 0 : dy < 0);
    },
    /** True right after a swipe, so the tap-to-close behind it can ignore the touch. */
    swiped: () => { const s = g.current.swiped; g.current.swiped = false; return s; },
  };
}

/** A dimmed page with one element cut out, and a card that explains it. */
function Spotlight({ spot, step, steps, onBack, onNext, onJump, onClose }: { spot: Spot; step?: number; steps?: string[]; onBack?: () => void; onNext?: () => void; onJump?: (i: number) => void; onClose: () => void }) {
  const total = steps?.length, flip = useFlip(total ? onNext : undefined, onBack);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLElement>(null), [cardH, setCardH] = useState(200);
  useLayoutEffect(() => { const h = card.current?.offsetHeight; if (h && h !== cardH) setCardH(h); });
  useLayoutEffect(() => {
    // Follows the target while open: smooth scrolling, layout shifts and resizes all move it.
    let last = "";
    const el = () => {
      for (const sel of spot.target.split(",")) { const n = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((x) => x.offsetParent !== null); if (n) return n; }
      return null;
    };
    el()?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    const measure = () => {
      const r = el()?.getBoundingClientRect() ?? null, key = r ? [r.top, r.left, r.width, r.height].map(Math.round).join() : "";
      if (key !== last) { last = key; setRect(r); }
    };
    measure();
    const timer = setInterval(measure, 50);
    return () => clearInterval(timer);
  }, [spot.target, spot.tab, spot.crew]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") onNext?.(); if (e.key === "ArrowLeft") onBack?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onBack]);

  const pad = 8, w = Math.min(340, window.innerWidth - 32);
  const box = rect && { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: Math.min(rect.height + pad * 2, window.innerHeight * 0.7) };
  const below = !box || box.top + box.height + cardH + 24 < window.innerHeight;
  const tall = !!box && box.height > window.innerHeight * 0.45; // no room beside it: sit at the bottom, over the target
  const cardTop = !box ? window.innerHeight / 2 - 90 : tall ? window.innerHeight - cardH - 16 : below ? Math.min(box.top + box.height + 12, window.innerHeight - cardH - 12) : Math.max(12, box.top - 12 - cardH);
  const cardLeft = !box || tall ? (window.innerWidth - w) / 2 : Math.max(16, Math.min(box.left, window.innerWidth - w - 16));
  return <div className={"spotlight" + (total ? " touring" : "")} role="dialog" aria-modal="true" aria-label={spot.title} {...(total ? { onWheel: flip.onWheel, onTouchStart: flip.onTouchStart, onTouchEnd: flip.onTouchEnd } : {})}>
    <div className="spotlight-catch" onClick={() => { if (!flip.swiped()) onClose(); }} />
    {box ? <div className="spotlight-hole" style={box} /> : <div className="spotlight-dim" />}
    <section ref={card} className="spotlight-card" style={{ top: cardTop, left: cardLeft, width: w }}>
      {total ? <span className="eyebrow">Tour · {step! + 1} of {total}</span> : <span className="eyebrow">Show me</span>}
      <h3>{spot.title}</h3><p>{spot.body}</p>
      {total && <nav className="tour-dots" aria-label="Tour steps">{steps!.map((t, i) => <button key={t} aria-label={`Step ${i + 1}: ${t}`} title={t} aria-current={i === step ? "step" : undefined} className={i === step ? "on" : ""} onClick={() => onJump?.(i)} />)}</nav>}
      {total && step === 0 && <small className="tour-hint">Swipe, scroll or use the arrow keys to move between steps.</small>}
      <div className="spotlight-actions">
        {total || !onNext ? <button className="text-button" onClick={onClose}>{total ? "End tour" : "Close"}</button> : <span />}
        <span>{total ? <button className="secondary" aria-label="Previous step" disabled={!onBack} onClick={onBack}><ArrowLeft size={15} />Back</button> : onBack && <button className="secondary" aria-label="Previous step" onClick={onBack}><ArrowLeft size={15} /></button>}
          {onNext && <button className="primary" autoFocus onClick={onNext}>{!total ? "Got it" : step! + 1 === total ? "Done" : "Next"}<ArrowRight size={15} /></button>}</span>
      </div>
    </section>
  </div>;
}

export type HelpTab = "help" | "data";

/** First-visit welcome card, the optional tour and the ? panel. `show` moves the app to the place a step needs. */
export function Onboarding({ hold, show, inNight, helpOpen, setHelpOpen, helpTab }: { hold?: boolean; show: (p: Place) => void; inNight: boolean; helpOpen: boolean; setHelpOpen: (v: boolean) => void; helpTab?: HelpTab }) {
  const [welcome, setWelcome] = useState(!introSeen());
  const [tour, setTour] = useState<number | null>(null), [single, setSingle] = useState<Spot | null>(null);
  const [tab, setTab] = useState<HelpTab>("help");
  useEffect(() => { if (helpOpen && helpTab) setTab(helpTab); }, [helpOpen, helpTab]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]");
      if (e.key === "?" && !typing) { e.preventDefault(); setHelpOpen(true); }
      if (e.key === "Escape" && helpOpen) setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen, setHelpOpen]);

  function go(i: number) { show(TOUR[i]); setTour(i); }
  function startTour() { track("tour-start"); setHelpOpen(false); setWelcome(false); markSeen(); go(0); }
  function showMe(f: Spot) { track("show-me", { feature: f.title }); setHelpOpen(false); show(f); setSingle(f); }

  return <>
    {welcome && !hold && <div className="modal-backdrop" role="presentation"><section className="welcome-card" role="dialog" aria-modal="true" aria-label="Welcome to DocuHop">
      <span className="eyebrow">IDFA · 12–22 NOV 2026</span>
      <h2 className="an">DOCUHOP</h2>
      <p>A free planner for IDFA, the documentary festival in Amsterdam. Everything from MuseumHop is here, plus four new things for IDFA:</p>
      <ul className="lt-list">{NEW.map((n) => <li key={n.title}><b>{n.title}</b><span>{n.body}</span></li>)}</ul>
      <p className="small">No account. {UNOFFICIAL} {CHECK} Tickets are sold on IDFA’s own site.</p>
      <button className="btn big" autoFocus onClick={() => { markSeen(); setWelcome(false); track("intro-close", { then: "explore" }); }}>START</button>
      <button className="btn ghost" onClick={startTour}>TAKE THE TOUR · 4 STEPS</button>
    </section></div>}

    {tour !== null && <Spotlight spot={TOUR[tour]} step={tour} steps={TOUR.map((t) => t.title)} onJump={go} onClose={() => { track("tour-end", { step: tour + 1, finished: false }); setTour(null); }}
      onBack={tour > 0 ? () => go(tour - 1) : undefined} onNext={() => (tour + 1 < TOUR.length ? go(tour + 1) : (track("tour-end", { step: tour + 1, finished: true }), setTour(null)))} />}
    {single && <Spotlight spot={single} onClose={() => setSingle(null)} />}

    {helpOpen && <div className="modal-backdrop help-backdrop" onClick={() => setHelpOpen(false)}>
      <aside className="help-drawer" role="dialog" aria-modal="true" aria-label="How DocuHop works" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close help" onClick={() => setHelpOpen(false)}><X size={20} /></button>
        {tab === "data" ? <><button className="text-button" onClick={() => setTab("help")}><ArrowLeft size={14} />How DocuHop works</button><YourData /></> : <div className="help-panel">
          <h2 className="an">HOW DOCUHOP WORKS</h2>
          <div className="help-cols">
            <div>
              <p>Everything from MuseumHop is here. Tap <span className="y">SHOW ME</span> and we’ll point at it.</p>
              {GROUPS.map((g) => <section key={g} className="help-group"><h3>{g}</h3><ul className="help-features">{FEATURES.filter((f) => f.group === g).map((f) => <li key={f.title}>
                <div><b className="an">{f.title}</b><span>{f.body}</span>{f.needsNight && !inNight && <small>Once you’ve started or joined a group.</small>}</div>
                <button className="show-me" disabled={f.needsNight && !inNight} onClick={() => (f.title === "Your data" ? setTab("data") : showMe(f))}>SHOW ME</button>
              </li>)}</ul></section>)}
            </div>
            <div>
              <h3 className="y">NEW AT IDFA</h3>
              <ul className="lt-list">{NEW.map((n) => <li key={n.title}><b>{n.title}</b><span>{n.body}</span></li>)}</ul>
              <button className="btn big" onClick={startTour}>TAKE THE TOUR · 4 STEPS</button>
              <p className="small">This panel opens with the ? button. On a first visit, a short welcome card shows these four new things.</p>
              <p className="help-contact"><Mail size={15} /><span>Found a bug, or missing something? Email <a href={CONTACT}>{CONTACT_EMAIL}</a>.<br /><a href={MAKER} target="_blank" rel="noopener">A project by Arian Shafa ↗</a></span></p>
              <p className="small">{UNOFFICIAL} {CHECK} Titles, times, halls and English subtitles come from IDFA’s public programme on <a href={SOURCE} target="_blank" rel="noreferrer">idfa.nl</a> (last checked {checkedAt()}). DocuHop doesn’t know whether tickets are left: IDFA’s page does.</p>
              <div className="help-keys"><p><kbd>?</kbd>This help</p><p><kbd>Esc</kbd>Close any panel</p></div>
            </div>
          </div>
        </div>}
      </aside>
    </div>}
  </>;
}

/** Plain-language privacy page. Every line here must stay true: change it when the app's data handling changes. */
export function YourData() {
  return <div className="help-panel your-data">
    <span className="eyebrow">Your data</span>
    <h2 className="an">Your group is only visible to the people in it.</h2>
    <section>
      <h3>What DocuHop keeps</h3>
      <ul>
        <li>The name and colour you pick</li>
        <li>Your reactions (Must-see, Up for it, Skip), notes, shot lists, votes, crews and meet-up points</li>
        <li>What you tick on the ticket board (got a ticket, want one, skip) and the festival days you mark as free. DocuHop never sees your real tickets or your MyIDFA account</li>
        <li>A list of changes in your group, so everyone sees who changed what</li>
      </ul>
      <p><b>Just looking around?</b> Then DocuHop keeps nothing about you. An anonymous sign-in (no name, email or password) is made only when you start or join a group.</p>
      <p><b>Not kept:</b> your phone number, email address, contacts or location. No ads, no tracking cookies and no usage statistics.</p>
      <p><b>Your location</b>, only if you tap LOC on the map: your phone works out the blue dot and the walking times, and the location never leaves it. It isn’t sent to your group, to DocuHop or anyone else, and it’s forgotten when you close the page. “Walk there” and Google Maps buttons hand a cinema’s address to Google Maps; Google then sees what you do there.</p>
      <p><b>Buying tickets</b> happens on IDFA’s own site. DocuHop only links there: it doesn’t see what you buy and doesn’t know whether tickets are left.</p>
      <p><b>In this browser:</b> who you are, your groups, changes waiting to sync, whether you’ve seen the welcome card, and films you skipped in Now. Clearing your browser removes them, which is why a personal link helps.</p>
    </section>
    <section>
      <h3>How long</h3>
      <p>Every group, with everything in it, is deleted automatically 30 days after the festival’s last day: on 23 December 2026. A sign-in that never ended up in a group is removed after a day.</p>
    </section>
    <section>
      <h3>Who sees what</h3>
      <p><b className="ok">Your group</b>, everyone who joined with your group’s invite link, sees names, reactions, notes, shot lists, who has a ticket, free days and the list of changes.</p>
      <p><b className="ok">People with your view-only link</b>, if your group makes one, see the shot lists with times and places. No names, reactions, notes or tickets. They don’t join the group, and a new link or “turn off” stops the old one.</p>
      <p><b className="ok">Only you</b> have your personal link.</p>
      <p><b className="no">Other groups</b> can’t list, search or open your group. There is no public list; the only way in is the invite link. Anyone you forward that link to can join and edit, so share it with your group only.</p>
    </section>
    <section>
      <h3>How it’s enforced</h3>
      <ul>
        <li>Database rules check that you’re in a group on every read and every change.</li>
        <li>Invite links are stored only as a fingerprint (hash), and personal links only as a one-way password hash, so a copy of the database doesn’t reveal working links.</li>
        <li>A new personal link turns your old one off.</li>
        <li>Automated checks try to break these rules (for example “someone outside the group sees nothing”) whenever they change.</li>
      </ul>
    </section>
    <section>
      <h3>Where the times come from</h3>
      <p>Titles, times, halls, lengths and English subtitles are copied from IDFA’s public programme on <a href={SOURCE} target="_blank" rel="noreferrer">idfa.nl</a>, last checked {checkedAt()}. They’re refreshed at most twice a day. DocuHop reads no ticket data, descriptions or images from IDFA, and your browser contacts IDFA only when you open one of its links. {CHECK}</p>
    </section>
    <section>
      <h3>Services involved</h3>
      <p>Supabase stores the plans (in Frankfurt, in the EU), Google Fonts serves the fonts, unpkg serves the map code and PDOK (the Dutch government’s map service) serves the map. Like any website, they see your IP address when your browser loads from them.</p>
    </section>
    <p className="help-note">{UNOFFICIAL} Email <a href={CONTACT}>{CONTACT_EMAIL}</a> to have your data deleted sooner.</p>
  </div>;
}

export function HelpButton({ onClick }: { onClick: () => void }) {
  return <button className="chip help-button" aria-label="How DocuHop works" title="How DocuHop works (?)" onClick={onClick}>?</button>;
}
