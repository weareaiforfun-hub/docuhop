import { useEffect, useMemo, useRef, useState } from "react";
import { Accessibility, ArrowUpRight, Check, ChevronRight, KeyRound, Map as MapIcon, Plus, Route, Search, SlidersHorizontal, Undo2, Users, X } from "lucide-react";
import { activities, byId, byVenue, clock, COLORS, DAY, dayInfo, DAYS, initials, isVenue, lookup, otherShowings, showingsAt, span, type Item, type UiStop } from "./lib/catalogue";
import { addStopOps, derive, personalRouteOps, replaceRouteOps, useSync } from "./lib/night";
import { newId, sync, type Op } from "./lib/sync";
import { MapView, type MapLine } from "./components/map-view";
import { RouteIdeas, type Proposal } from "./components/route-ideas";
import { ActivityFeed, describe, SyncPill } from "./components/live";
import { ShareDialog } from "./components/share-dialog";
import { Crews } from "./components/crews";
import { HelpButton, Onboarding, SiteNote, UNOFFICIAL, type HelpTab, type Place } from "./components/help";
import { KeepSpot, OtherDevice, RecoverByEmail, TwoDoors, YourSpot } from "./components/keep-spot";
import { GettingAround, RideCard } from "./components/getting-around";
import { MODES } from "./data/transport";
import { Decide, REACTIONS, ReactionButtons, type ReactionKey } from "./components/decide";
import { setPrivate, track } from "./lib/track";
import { festivalDay, festivalMinute, useLocation, walkFrom } from "./lib/location";
import { GoogleMapsSheet } from "./components/google-maps";
import { ActivityInfo, useMinute } from "./components/activity-info";
import { alternatives, analyse, fits, IDEAS } from "./lib/plan";
import { FreeGrid, Legend, remainingDays, TicketBoard, TicketButtons, TicketChips, ticketOf, ticketOps, ticketSummary, type TicketStatus } from "./components/ticket-board";
import { ShotList } from "./components/shot-list";
import { NowView, useClock } from "./components/now";
import { Timeline } from "./components/timeline";

type Tab = "discover" | "day" | "crew";
type CrewSection = "board" | "decide" | "ideas" | "crews" | "activity";
type Sheet = "peek" | "half" | "full";
type Target = "personal" | "shared" | "crew";
type Undo = { text: string; ops: Op[] };

/** The built-in shot list ideas: readable by everyone, with or without a group. */
const SUGGESTED: Proposal[] = IDEAS.map((idea) => ({ id: idea.id, member_id: "docuhop", title: idea.title, description: idea.description, practical: idea.practical, route: idea.route, checked_at: "" }));
const SUGGESTER = [{ id: "docuhop", name: "Shot list idea" }];

/** Invite token -> group id, so a returning browser opens its groups without asking for a name again. */
const KNOWN = "dh:nights";
const known = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KNOWN) ?? "{}"); } catch { return {}; } };
const remember = (token: string, nightId: string) => { try { localStorage.setItem(KNOWN, JSON.stringify({ ...known(), [token]: nightId })); } catch { /* private mode */ } };
const EXAMPLE_NAME = ["Noor", "Sam", "Mila", "Daan", "Docu Fan", "Fly on the Wall", "Cinéma Vérité", "Night Owl"][Math.floor(Math.random() * 8)];
const pref = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const setPref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const isPhone = () => window.matchMedia("(max-width: 899px)").matches;
/** Before the festival, start on Friday (Thursday is the opening night only); after it, on the last day. */
const firstDay = () => festivalDay() ?? (festivalMinute() < 0 ? 1 : DAYS.length - 1);

export default function App() {
  const { data, status, userId } = useSync();
  // Keep typed names and notes out of the click stats (see setPrivate).
  useEffect(() => {
    if (!data) return setPrivate([]);
    setPrivate([...data.dh_nights.map((n) => n.name), ...data.dh_members.map((m) => m.display_name), ...data.dh_crews.map((c) => c.name),
      ...data.dh_routes.map((r) => r.title), ...data.dh_reactions.map((r) => r.note), ...data.dh_meetups.map((m) => m.note)]);
  }, [data]);
  const minuteNow = useMinute(), now = festivalMinute(minuteNow), today = festivalDay(minuteNow);
  const [tab, setTab] = useState<Tab>("discover"), [sheet, setSheet] = useState<Sheet>("half"), [detailSize, setDetailSize] = useState<Sheet>("full"), [crewSection, setCrewSection] = useState<CrewSection>("board");
  const [day, setDay] = useState(firstDay), [target, setTarget] = useState<Target>("personal"), [nowMode, setNowMode] = useState(false), [dayView, setDayView] = useState<"list" | "timeline">("list");
  const [query, setQuery] = useState(""), [english, setEnglish] = useState(false), [doclab, setDoclab] = useState(false), [stepFree, setStepFree] = useState(false);
  const [venueFilter, setVenueFilter] = useState(""), [fromTime, setFromTime] = useState(""), [picksOnly, setPicksOnly] = useState(false), [personFilter, setPersonFilter] = useState("all"), [near, setNear] = useState(false), [filtersOpen, setFiltersOpen] = useState(false);
  const [invite, setInvite] = useState(""), [nightId, setNightId] = useState(""), [resolving, setResolving] = useState(false);
  const [spotOpen, setSpotOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false), [deviceOpen, setDeviceOpen] = useState(false), [doorChosen, setDoorChosen] = useState(false), [switchLink, setSwitchLink] = useState(false), [, setLinkMade] = useState(0);
  const loc = useLocation(), [locateTick, setLocateTick] = useState(0), [gmapsOpen, setGmapsOpen] = useState(false), [zoomBy, setZoomBy] = useState(0);
  const [shareOpen, setShareOpen] = useState(false), [recoverOpen, setRecoverOpen] = useState(false);
  const [name, setName] = useState(pref("dh:name")), [color, setColor] = useState(pref("dh:color") || COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [note, setNote] = useState(""), [selected, setSelected] = useState<Item | null>(null), [focus, setFocus] = useState<string | null>(null), [fit, setFit] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [toast, setToast] = useState(""), [undo, setUndo] = useState<Undo | null>(null), [nameDialog, setNameDialog] = useState(false);
  const [previewStops, setPreviewStops] = useState<UiStop[] | null>(null), [previewId, setPreviewId] = useState<string | null>(null);
  const [pendingIdea, setPendingIdea] = useState<string | null>(null), [pendingAdd, setPendingAdd] = useState<string | null>(null), [pendingWhere, setPendingWhere] = useState<Target>("personal"), [helpOpen, setHelpOpen] = useState(false), [helpTab, setHelpTab] = useState<HelpTab>("help");
  const [ridesOpen, setRidesOpen] = useState(false), [layers, setLayers] = useState(() => new Set(MODES.filter((m) => m.on).map((m) => m.id)));
  const [hideVenues, setHideVenues] = useState(false), [ride, setRide] = useState<{ mode: string; stop: number } | null>(null);
  const shownModes = useMemo(() => (ridesOpen ? MODES.filter((m) => layers.has(m.id)) : []), [ridesOpen, layers]);
  const rideMode = ride && shownModes.find((m) => m.id === ride.mode);
  const sheetDrag = useRef<{ y: number; at: Sheet } | null>(null);

  const night = useMemo(() => (data ? derive(data, userId) : null), [data, userId]);
  const identity = night?.me;
  const route = night?.stopsOf(night.shared?.id) ?? [];
  const myRoute = night?.stopsOf(night.mine?.id) ?? [];
  const crewRoute = night?.crewRoute(night.myCrewId);
  const crewStops = night?.stopsOf(crewRoute?.id) ?? [];
  const myCrewName = data?.dh_crews.find((c) => c.id === night?.myCrewId)?.name;
  const realMembers = night?.members.filter((m) => !m.fictional) ?? [];
  const inGroup = realMembers.length > 1;
  const proposals: Proposal[] = useMemo(() => (night?.personal ?? []).map((r) => ({
    id: r.id, member_id: r.owner_user!, title: r.title || (night!.memberOf.get(r.owner_user!)?.display_name ?? "Someone") + "’s shot list",
    description: r.description, practical: r.practical, route: [...night!.stopsOf(r.id)].sort((a, b) => (byId.get(a.id)?.start ?? 0) - (byId.get(b.id)?.start ?? 0)), checked_at: r.updated_at,
  })), [night]);
  const people = useMemo(() => realMembers.map((m) => ({ id: m.user_id, name: m.display_name, fictional: 0, color: m.color })), [night]);
  const suggestions = useMemo(() => (data?.dh_reactions ?? []).filter((r) => r.reaction !== "skip").map((r) => ({ member_id: r.user_id, event_id: r.event_id, note: r.note, id: r.id, reaction: r.reaction })), [data]);
  const myReaction = (eventId: string) => data?.dh_reactions.find((r) => r.user_id === userId && r.event_id === eventId)?.reaction;
  const myTicket = (eventId: string) => ticketOf(data, userId, eventId)?.status;
  const canEditShared = !!identity && identity.role !== "viewer";
  const nameOf = (uid: string) => (uid === userId ? "You" : night?.memberOf.get(uid)?.display_name);
  /** The list the shot list tab shows and + adds to. */
  const list = target === "shared" ? route : target === "crew" ? crewStops : myRoute;
  const listRoute = target === "shared" ? night?.shared : target === "crew" ? crewRoute : night?.mine;
  const listTitle = target === "shared" ? "OUR SHOT LIST" : target === "crew" ? `${(myCrewName ?? "CREW").toUpperCase()}’S SHOT LIST` : "MY SHOT LIST";
  const listCanEdit = target === "personal" ? true : target === "shared" ? canEditShared : !!crewRoute && canEditShared;
  const proposal = proposals.find((p) => p.id === previewId) ?? SUGGESTED.find((p) => p.id === previewId);
  const todayHasPlan = today != null && list.some((s) => byId.get(s.id)?.day === today);

  /* ---------- which group: the invite token in the address ---------- */
  useEffect(() => {
    const readLocation = () => {
      const token = new URLSearchParams(location.hash.slice(1)).get("night") || "";
      setPreviewId(null); setPersonFilter("all"); setPicksOnly(false); setSelected(null); setError("");
      setInvite(token);
      if (token && !/^[a-f0-9]{64}$/.test(token)) { setError("This invitation link is invalid. Ask your friend for the complete link."); return; }
      const id = token ? known()[token] : "";
      setNightId(id || "");
      if (!id) sync?.close();
      if (token && !id && sync) {
        setResolving(true);
        sync.memberNight(token).then((found) => { if (found) { remember(token, found); setNightId(found); } }).finally(() => setResolving(false));
      }
    };
    readLocation();
    window.addEventListener("hashchange", readLocation);
    return () => window.removeEventListener("hashchange", readLocation);
  }, []);
  useEffect(() => { if (nightId && sync) sync.open(nightId, { name: pref("dh:name"), color: pref("dh:color") }).catch((e) => setError(e.message)); }, [nightId]);
  useEffect(() => sync?.onNotice((n) => (n.kind === "error" ? setError(n.text) : setToast(n.text))), []);
  useEffect(() => { sync?.ready.then(() => { if (sync!.linkProblem) setError(sync!.linkProblem); if (sync!.pendingLink) setSwitchLink(true); }); }, []);
  const backedUp = !!identity && !!sync?.backedUp();
  useEffect(() => { if (identity) sync?.updatePresence({ name: identity.display_name, color: identity.color }); }, [identity?.display_name, identity?.color]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 7000); return () => clearTimeout(t); }, [undo]);
  useEffect(() => {
    if (!selected && !nameDialog) return;
    const prior = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelected(null); setNameDialog(false); }
      if (e.key === "Tab") {
        const dialogs = document.querySelectorAll("[role=dialog]");
        const nodes = Array.from(dialogs[dialogs.length - 1]?.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],input,select,textarea") || []);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prior?.focus(); };
  }, [selected, nameDialog]);
  useEffect(() => { document.querySelector(".panel-body")?.scrollTo({ top: 0 }); }, [tab, crewSection]);
  // Each tab has its own natural sheet height on a phone: the list over the map, the plan with its route, the group in full.
  useEffect(() => { setSheet(tab === "crew" ? "full" : "half"); if (tab !== "day") setNowMode(false); }, [tab]);
  useEffect(() => { setPreviewStops(null); }, [previewId, tab]);

  /* ---------- usage events (lib/track.ts; no stats script is loaded yet, so these go nowhere) ---------- */
  const firstRender = useRef(true);
  useEffect(() => { if (!firstRender.current) track("tab", { name: tab }); }, [tab]);
  useEffect(() => { if (!firstRender.current) track("day", { day: day + 12 }); }, [day]);
  useEffect(() => { firstRender.current = false; }, []);

  /* ---------- changes ---------- */
  /** Shows ops at once and saves them; with a label, offers to undo. */
  function run(ops: Op[], label?: string) {
    if (!sync || !ops.length) return;
    if (!identity) { setNameDialog(true); return; }
    const inverse = sync.apply(ops);
    if (label) setUndo({ text: label, ops: inverse });
  }
  const title = (id: string) => byId.get(id)?.title ?? "showing";
  const stopFor = (e: Item, extra: Partial<UiStop> = {}): UiStop => ({ id: e.id, arrival: clock(e.start), duration: Math.max(1, Math.min(900, e.minutes)), fixed: true, ...extra });
  const addExtra = (id: string) => { const e = byId.get(id)!; return { arrival: clock(e.start), duration: Math.max(1, Math.min(900, e.minutes)), fixed: true }; };
  function addTo(id: string, where: Target = target) {
    const e = byId.get(id);
    if (!e) return;
    if (!identity || !night) { setPendingAdd(id); setPendingWhere(where); setNameDialog(true); return; }
    const clash = !fits(where === "shared" ? route : where === "crew" ? crewStops : myRoute, e);
    const suffix = clash ? " · it clashes, see your shot list" : "";
    track("stop-add", { route: where, clash });
    if (where === "shared" && night.shared) run(addStopOps(night.shared, route, id, addExtra(id)), `Added ${title(id)} to our shot list${suffix}`);
    else if (where === "crew" && crewRoute) run(addStopOps(crewRoute, crewStops, id, addExtra(id)), `Added ${title(id)} to ${myCrewName}’s shot list${suffix}`);
    else if (night.mine) run(addStopOps(night.mine, myRoute, id, addExtra(id)), `Added ${title(id)} to your shot list${suffix}`);
    else run(personalRouteOps(identity.night_id, userId, undefined, identity.display_name + "’s shot list", [stopFor(e)]).ops, `Added ${title(id)} to your shot list`);
  }
  function removeFrom(id: string, where: Target = target) {
    const s = (where === "shared" ? route : where === "crew" ? crewStops : myRoute).find((x) => x.id === id);
    if (s?.rowId) run([{ t: "delete", table: "dh_stops", id: s.rowId }], `Removed ${title(id)}`);
  }
  /** Sets, changes or (with null) clears my reaction to a showing. */
  function react(eventId: string, reaction: ReactionKey | null, withNote?: string) {
    if (!night || !identity) { setNameDialog(true); return; }
    const mine = data!.dh_reactions.find((r) => r.user_id === userId && r.event_id === eventId);
    track("reaction", { kind: reaction ?? "clear", note: !!withNote });
    if (!reaction) { if (mine) run([{ t: "delete", table: "dh_reactions", id: mine.id }]); return; }
    run(mine ? [{ t: "update", table: "dh_reactions", id: mine.id, patch: { reaction, note: withNote ?? mine.note, updated_at: new Date().toISOString() } }]
      : [{ t: "insert", table: "dh_reactions", row: { id: newId(), night_id: identity.night_id, user_id: userId, event_id: eventId, reaction, note: withNote ?? "" } }]);
  }
  function setTicket(eventId: string, s: TicketStatus | null) {
    if (!night || !identity || !data) { setNameDialog(true); return; }
    track("ticket", { status: s ?? "clear" });
    const label = s === "got" ? `You ticked “Got it” for ${title(eventId)}` : s === "want" ? `You want a ticket for ${title(eventId)}` : s === "skip" ? `You skip ${title(eventId)}` : `Cleared your ticket for ${title(eventId)}`;
    run(ticketOps(data, identity.night_id, userId, eventId, s), label);
  }
  function setFree(d: number, free: boolean) {
    if (!night || !identity || !data) return;
    const row = data.dh_free.find((f) => f.user_id === userId && f.day === d);
    track("free-day", { free });
    run(free ? (row ? [] : [{ t: "insert", table: "dh_free", row: { id: newId(), night_id: identity.night_id, user_id: userId, day: d } }]) : row ? [{ t: "delete", table: "dh_free", id: row.id }] : []);
  }
  function vote(routeId: string | null) {
    if (!identity) { setNameDialog(true); return; }
    const mine = data!.dh_idea_votes.find((v) => v.user_id === userId);
    run(!routeId ? (mine ? [{ t: "delete", table: "dh_idea_votes", id: mine.id }] : [])
      : mine ? [{ t: "update", table: "dh_idea_votes", id: mine.id, patch: { route_id: routeId } }]
      : [{ t: "insert", table: "dh_idea_votes", row: { id: newId(), night_id: identity.night_id, user_id: userId, route_id: routeId } }]);
  }
  async function adoptIdea(id: string) {
    if (!identity) { setNameDialog(true); return; }
    setBusy(true);
    try { await sync!.rpc("dh_adopt_route", { p_route: id }); track("route-adopt", { from: "idea" }); setPreviewId(null); setTarget("shared"); setTab("day"); setFit((f) => f + 1); setError(""); setToast("The group’s shot list is ready. Everyone can adjust it."); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  /** Adds a built-in idea's showings to the list you're planning (yours, unless you picked the group's or your crew's). */
  function adoptSuggested(id: string) {
    const idea = SUGGESTED.find((p) => p.id === id);
    if (!idea) return;
    if (!identity || !night) { setPendingIdea(id); setNameDialog(true); return; }
    const into = target === "shared" && night.shared ? night.shared : target === "crew" && crewRoute ? crewRoute : night.mine;
    const current = target === "shared" ? route : target === "crew" ? crewStops : myRoute;
    track("route-adopt", { from: "suggested", route: idea.id });
    if (into) {
      let pos = current.at(-1)?.pos ?? 0;
      run(idea.route.filter((s) => !current.some((c) => c.id === s.id)).map((s): Op => ({ t: "insert", table: "dh_stops", row: { id: newId(), night_id: into.night_id, route_id: into.id, pos: ++pos, event_id: s.id, arrival: s.arrival, duration: s.duration, reason: "", practical: "", transfer: "", fixed: true, maybe: false, travel: null } })), `Added “${idea.title}” to ${target === "shared" ? "our" : target === "crew" ? myCrewName + "’s" : "your"} shot list`);
    } else run(personalRouteOps(identity.night_id, userId, undefined, identity.display_name + "’s shot list", idea.route).ops, `Added “${idea.title}” to your shot list`);
    const first = byId.get(idea.route[0].id);
    setPreviewId(null); if (first) setDay(first.day); setTab("day"); setFit((f) => f + 1);
  }
  useEffect(() => {
    if (!identity || !night) return;
    if (pendingIdea) { const id = pendingIdea; setPendingIdea(null); adoptSuggested(id); }
    if (pendingAdd) { const id = pendingAdd; setPendingAdd(null); addTo(id, pendingWhere === "shared" && night?.shared ? "shared" : "personal"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.id, night?.night?.id]);
  async function enter() {
    if (!sync || !name.trim()) return;
    setBusy(true); setError("");
    setPref("dh:name", name.trim()); setPref("dh:color", color);
    try {
      if (identity && nameDialog) {
        run([{ t: "update", table: "dh_members", id: identity.id, patch: { display_name: name.trim(), color } }]);
        setNameDialog(false);
        return;
      }
      const token = invite || await sync.createNight("IDFA 2026", name.trim(), color);
      const id = await sync.joinNight(token, name.trim(), color);
      remember(token, id);
      history.replaceState(null, "", "#night=" + token);
      setInvite(token);
      if (id === nightId) await sync.reload(); else setNightId(id);
      setNameDialog(false);
      track(invite ? "night-join" : "night-create");
      setToast(invite ? "You joined the group." : "Your plan is saved. Invite friends any time.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function share() {
    if (!invite) { setNameDialog(true); return; }
    if (identity) { setShareOpen(true); return; }
    try { await navigator.clipboard.writeText(location.origin + location.pathname + "#night=" + invite); setToast("Invite link copied. Anyone with it can join and edit."); }
    catch { setToast("Copy the invitation from your browser address bar."); }
  }

  /* ---------- the programme for the chosen day ---------- */
  const dayList = useMemo(() => activities.filter((e) => e.day === day), [day]);
  const filtered = useMemo(() => {
    let l = dayList;
    if (today === day) l = l.filter((e) => e.end > now);
    if (english) l = l.filter((e) => e.english);
    if (doclab) l = l.filter((e) => e.doclab);
    if (stepFree) l = l.filter((e) => byVenue.get(e.venueId)?.stepFree);
    if (venueFilter) l = l.filter((e) => e.venueId === venueFilter);
    if (fromTime) l = l.filter((e) => e.start % DAY >= Number(fromTime) * 60);
    if (picksOnly) l = l.filter((e) => suggestions.some((s) => s.event_id === e.id && (personFilter === "all" || s.member_id === personFilter)));
    if (near && loc.spot) l = l.filter((e) => (walkFrom(loc.spot!, e.venueId)?.minutes ?? 99) <= 15);
    if (query.trim()) { const q = query.toLocaleLowerCase(); l = l.filter((e) => (e.title + " " + e.hall + " " + byVenue.get(e.venueId)?.name + " " + e.tags.join(" ")).toLocaleLowerCase().includes(q)); }
    return l;
  }, [dayList, english, doclab, stepFree, venueFilter, fromTime, picksOnly, personFilter, near, loc.spot, query, suggestions, today, day, now]);
  // Search looks across all days when nothing matches today.
  const elsewhere = useMemo(() => {
    if (!query.trim() || filtered.length) return [];
    const q = query.toLocaleLowerCase();
    return activities.filter((e) => e.day !== day && e.end > now && (e.title + " " + e.hall).toLocaleLowerCase().includes(q)).slice(0, 12);
  }, [query, filtered.length, day, now]);
  const chips = [english && ["English subs", () => setEnglish(false)], doclab && ["DocLab", () => setDoclab(false)], stepFree && ["Step-free", () => setStepFree(false)],
    venueFilter && [byVenue.get(venueFilter)?.short, () => setVenueFilter("")], fromTime && ["From " + fromTime + ":00", () => setFromTime("")], picksOnly && ["Picks", () => setPicksOnly(false)], near && ["Within 15 min", () => setNear(false)]]
    .filter(Boolean) as [string, () => void][];
  /** A tap on the map: on a phone the details open as a small sheet over the map; drag it up for more. */
  function pickFromMap(e: Item) { pick(e); if (isPhone()) setDetailSize("peek"); }
  const detailDrag = useRef<number | null>(null), detailDragged = useRef(false);
  const resizeDetail = (up: boolean) => {
    const order: Sheet[] = ["peek", "half", "full"], i = order.indexOf(detailSize) + (up ? 1 : -1);
    if (i < 0) setSelected(null); else setDetailSize(order[Math.min(i, 2)]);
  };
  function pick(e: Item) { setDetailSize("full"); setSelected(e); setFocus(e.venueId); setNote(suggestions.find((s) => s.event_id === e.id && s.member_id === userId)?.note || ""); if (isPhone() && sheet === "full") setSheet("half"); }
  const suggesters = (id: string) => suggestions.filter((s) => s.event_id === id && s.member_id !== userId);

  /* ---------- the map ---------- */
  const dayStops = (stops: UiStop[]) => stops.filter((s) => byId.get(s.id)?.day === day);
  const mapRoute = previewStops || proposal?.route || (tab === "discover" && !list.length ? [] : list);
  const lines: MapLine[] = useMemo(() => tab === "crew" && crewSection === "crews" && !previewStops && night && data?.dh_crews.length
    ? data.dh_crews.map((c) => ({ stops: dayStops(night.stopsOf(night.crewRoute(c.id)?.id)), color: c.color, numbered: c.id === night.myCrewId }))
    : [{ stops: previewStops || proposal ? mapRoute : dayStops(mapRoute), color: "#f5d90a", numbered: true }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapRoute, tab, crewSection, previewStops, night, data?.dh_crews, day]);
  useEffect(() => { setFit((f) => f + 1); }, [day, target, previewId]);
  // After the phone sheet has moved (tab change), frame the route again in the part of the map you can see.
  useEffect(() => { const t = setTimeout(() => setFit((f) => f + 1), 320); return () => clearTimeout(t); }, [tab, sheet]);
  const visible = ridesOpen && hideVenues ? [] : tab === "discover" ? filtered : dayList;
  const plan = analyse(list).slots;
  const nextSlot = plan.find((s) => s.day === day && s.end > now);
  const nextWalk = nextSlot && loc.spot ? walkFrom(loc.spot, nextSlot.item.venueId) : null;
  const meLabel = nextSlot && nextWalk && nextWalk.metres < 15000 ? `${nextWalk.minutes} min walk to ${nextSlot.item.venue}` : undefined;
  // On the day: a reminder for a showing you marked "I want one" (your own ticket board, not IDFA's ticket data).
  const needSlot = today === day ? plan.find((s) => s.day === day && s.end > now && myTicket(s.id) === "want") : undefined;
  const loading = (resolving || !!nightId) && !night?.members.length && status?.conn !== "offline";
  const doorPending = /[#&]night=/.test(location.hash) && !identity && !doorChosen;
  const doors = doorPending && !!invite && !loading;
  const clockNow = useClock(), info = dayInfo(day);
  const gmaps = { stops: dayStops(list).sort((a, b) => byId.get(a.id)!.start - byId.get(b.id)!.start), title: `${listTitle.toLowerCase()}, ${info.label}` };

  const joinForm = (
    <form className="join-form" onSubmit={(e) => { e.preventDefault(); enter(); }}>
      <label htmlFor="your-name">Your name</label>
      <input id="your-name" autoFocus={nameDialog} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder={"e.g. " + EXAMPLE_NAME} autoComplete="given-name" required />
      <div className="color-choice" role="radiogroup" aria-label="Your colour">
        {COLORS.map((c) => <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={"Colour " + c} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} />)}
      </div>
      <button className="btn" disabled={busy || !name.trim()}>{busy ? "Saving…" : identity && nameDialog ? "Save name" : invite ? "Join this group" : "Start my plan"}<ArrowUpRight size={16} /></button>
      <small>No account. Your name is remembered in this browser. Invite friends later with one link; everyone with it can see and edit the group’s plan.</small>
    </form>
  );

  const dayStrip = (cls = "") => <div className={"day-strip " + cls} role="group" aria-label="Festival days">{DAYS.map((d, i) => {
    const planned = list.some((s) => byId.get(s.id)?.day === i);
    return <button key={i} className={(i === day ? "on" : "") + (today != null && i < today ? " past" : "") + (planned ? " planned" : "")} aria-pressed={i === day} aria-label={d.long + (planned ? ", you have films planned" : "")} onClick={() => { setDay(i); setNowMode(false); }}>
      <span>{d.letter}</span><b>{d.num}</b>
    </button>;
  })}</div>;

  const row = (e: Item, showDay = false) => {
    const inList = list.some((s) => s.id === e.id), walk = loc.spot ? walkFrom(loc.spot, e.venueId) : null;
    const likes = suggesters(e.id);
    return <li key={e.id} className={"pg-row" + (inList ? " in" : "")}>
      <span className="pg-time">{showDay && <small>{dayInfo(e.day).weekday} {dayInfo(e.day).num}</small>}{clock(e.start)}</span>
      <button className="pg-title" onClick={() => pick(e)}>
        <b>{e.title}</b>
        <small>{e.hall} · {span(e.minutes)}{walk && walk.metres < 15000 ? ` · ${walk.minutes} min${walk.ferry ? " + ferry" : ""}` : ""}{e.english ? " · EN subs" : ""}</small>
        {(likes.length > 0 || myReaction(e.id)) && <span className="pg-meta">{likes.length > 0 && <em>{likes.map((s) => nameOf(s.member_id)).join(", ")} {likes.length === 1 ? "likes" : "like"} this</em>}{myReaction(e.id) && <em className="mine">You: {REACTIONS.find((r) => r.key === myReaction(e.id))!.label}</em>}</span>}
      </button>
      <button className={"add-button" + (inList ? " added" : "")} aria-label={(inList ? "Remove from " : "Add to ") + listTitle.toLowerCase() + ": " + e.title} onClick={() => (inList ? removeFrom(e.id) : addTo(e.id))}>{inList ? <Check size={20} /> : <Plus size={22} />}</button>
    </li>;
  };

  const crewNav = <nav className="crew-nav" aria-label="Group">{([["board", "Tickets"], ["decide", "Decide"], ["ideas", "Ideas"], ["crews", "Crews"], ["activity", "Activity"]] as const).map(([k, l]) =>
    <button key={k} className={crewSection === k ? "on" : ""} aria-pressed={crewSection === k} onClick={() => setCrewSection(k)}>{l}</button>)}</nav>;
  const boardRows = useMemo(() => {
    const ids = new Set([...route.map((s) => s.id), ...(data?.dh_tickets ?? []).map((t) => t.event_id), ...(inGroup ? myRoute.map((s) => s.id) : [])]);
    return [...ids].map((id) => byId.get(id)).filter((e): e is Item => !!e && e.end > now - DAY).sort((a, b) => a.start - b.start).slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, myRoute, data?.dh_tickets, inGroup, Math.floor(now / 60)]);
  const lastChange = data?.dh_activity.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const targetToggle = identity && <div className="target-toggle" role="group" aria-label="Which shot list">
    {([["personal", "Mine"], ["shared", "Group"], ...(crewRoute ? [["crew", myCrewName ?? "Crew"]] : [])] as [Target, string][]).map(([k, l]) =>
      <button key={k} className={target === k ? "on" : ""} aria-pressed={target === k} onClick={() => setTarget(k)}>{l}</button>)}
    <span className="view-toggle" role="group" aria-label="View">{(["list", "timeline"] as const).map((v) => <button key={v} className={dayView === v ? "on" : ""} aria-pressed={dayView === v} onClick={() => setDayView(v)}>{v === "list" ? "List" : "Timeline"}</button>)}</span>
    {gmaps.stops.length > 0 && <button className="gmaps-button" onClick={() => setGmapsOpen(true)}><span className="long">Google </span>Maps</button>}
  </div>;

  if (!sync) return <main className="config-missing"><h1>DocuHop</h1><p>The backend isn't configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p></main>;
  const tabs: [Tab, string, typeof MapIcon][] = [["discover", "Discover", MapIcon], ["day", todayHasPlan && day === today ? "Now" : "My day", Route], ["crew", "Friends", Users]];
  const subtitle = undo ? { kind: "saved", text: undo.text } : toast ? { kind: "note", text: toast } : needSlot ? { kind: "ticket", text: `You still want a ticket for ${needSlot.item.title}. Tickets are on IDFA’s site.` } : null;

  return <main className={"app tab-is-" + tab} data-sheet={sheet}>
    <section className="map-panel" aria-label="Map">
      <MapView transport={{ modes: shownModes, selected: ride, onSelect: (mode, stop) => setRide({ mode, stop }) }} visible={visible} lines={lines} onSelect={pickFromMap} focus={focus} fit={fit} me={loc.spot} locate={locateTick} meLabel={meLabel} now={now} zoomBy={zoomBy} />
      <div className="viewfinder" aria-hidden="true"><i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" /><div className="vignette" /></div>
      <div className="vf-top">
        <div className="vf-left"><span className="rec"><i className="rec-dot" />REC</span><h1 className="an">DOCUHOP · DAY {day + 1} OF {DAYS.length}</h1><small>{UNOFFICIAL.toUpperCase()}</small></div>
        <div className="vf-right">{info.label.toUpperCase()} {clockNow.toLocaleTimeString("en-GB", { timeZone: "Europe/Amsterdam", hour12: false })}</div>
      </div>
      <span className="vf-help"><HelpButton onClick={() => { setHelpTab("help"); setHelpOpen(true); }} /></span>
      {proposal && <div className="preview-banner"><span>Preview: {proposal.title}</span><button onClick={() => setPreviewId(null)} aria-label="Close preview"><X size={15} /></button></div>}
      <div className="map-controls">
        <button className="ctl" aria-label="Zoom in" onClick={() => setZoomBy((z) => z + 1)}>+</button>
        <button className="ctl" aria-label="Zoom out" onClick={() => setZoomBy((z) => z - 1)}>−</button>
        <button className={"ctl locate-button" + (loc.status === "on" ? " on" : loc.status === "blocked" ? " blocked" : "")} aria-pressed={loc.status === "on"} aria-label={loc.status === "on" ? "Centre the map on me" : "Show where I am"} title="Show my location"
          onClick={() => { setLocateTick((n) => n + 1); if (loc.status !== "on") { track("locate", { from: loc.status }); loc.toggle(); } }}>LOC</button>
        <button className={"chip rides-button" + (ridesOpen ? " on" : "")} aria-pressed={ridesOpen} onClick={() => { setRidesOpen(!ridesOpen); setRide(null); }}>GETTING AROUND</button>
        <button className="chip fit-button" onClick={() => setFit((f) => f + 1)}>FIT</button>
      </div>
      {loc.status === "on" && <button className="chip locate-off" onClick={loc.toggle}>Hide my location</button>}
      {loc.status === "waiting" && <p className="locate-note" role="status">Finding you…</p>}
      {loc.status === "blocked" && <p className="locate-note" role="alert"><b>Location is blocked for this site.</b> Turn it on in your browser’s site settings, then tap LOC again. Everything else works without it.<button aria-label="Close" onClick={loc.dismiss}><X size={14} /></button></p>}
      {loc.status === "unavailable" && <p className="locate-note" role="alert"><b>Can’t find your location right now.</b> Try again outside or with a better signal.<button aria-label="Close" onClick={loc.dismiss}><X size={14} /></button></p>}
      {loc.status === "explain" && <div className="locate-explain" role="dialog" aria-label="Show where you are?">
        <b>Show where you are?</b>
        <p>A blue dot shows you on the map, with walking times from where you stand. Your location stays on this phone: nobody in your group sees it, and DocuHop doesn’t store it.</p>
        <button className="btn" autoFocus onClick={loc.start}>Show my location</button>
        <button className="text-button" onClick={loc.dismiss}>Not now</button>
      </div>}
      {ridesOpen && <GettingAround className="in-map" modes={MODES} layers={layers} hideVenues={hideVenues} onHideVenues={setHideVenues} onClose={() => { setRidesOpen(false); setRide(null); }}
        onToggle={(id) => { setLayers((l) => { const n = new Set(l); if (n.has(id)) n.delete(id); else n.add(id); return n; }); if (ride?.mode === id) setRide(null); }} />}
      {ride && rideMode && <RideCard mode={rideMode} stop={ride.stop} onClose={() => setRide(null)} onAdd={(id) => addTo(id)} onDetails={(id) => { const e = byId.get(id); if (e) pick(e); }} added={(id) => list.some((s) => s.id === id)} addLabel="Add" />}
      {subtitle && <p className="subtitle an" role="status">[{subtitle.kind}] {subtitle.text}{undo && subtitle.kind === "saved" && <button className="sub-undo" onClick={() => { sync!.apply(undo.ops); setUndo(null); }}><Undo2 size={14} />UNDO</button>}</p>}
      <span className="map-credit">Map © Kadaster / PDOK · DocuHop is unofficial, not affiliated with IDFA</span>
    </section>

    <aside className="panel" aria-label="Plan">
      <button className="sheet-handle" aria-label={"Panel height: " + sheet + ". Change"} onClick={() => setSheet(sheet === "peek" ? "half" : sheet === "half" ? "full" : "peek")}
        onPointerDown={(e) => { sheetDrag.current = { y: e.clientY, at: sheet }; }}
        onPointerUp={(e) => { const d = sheetDrag.current; sheetDrag.current = null; if (!d || Math.abs(e.clientY - d.y) < 30) return; e.preventDefault(); const order: Sheet[] = ["peek", "half", "full"]; const i = order.indexOf(d.at) + (e.clientY < d.y ? 1 : -1); setSheet(order[Math.max(0, Math.min(2, i))]); }}><i /></button>
      <header className={"panel-head" + (identity ? " signed-in" : "")}>
        <a href="./" className="brand an" aria-label="DocuHop home">DOCUHOP<small>IDFA<br />12–22 Nov</small></a>
        <span className="spacer" />
        {identity && <SyncPill status={status} compact />}
        <button className="chip on invite-button" onClick={share}>INVITE</button>
        <HelpButton onClick={() => { setHelpTab("help"); setHelpOpen(true); }} />
        {identity && <button className="chip link-button" aria-label="Your name, your link and other devices" onClick={() => setMenuOpen(true)}><span className="avatar" style={{ background: identity.color }}>{initials(identity.display_name)}</span></button>}
      </header>
      {error && <div className="error-banner" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}

      {tab === "discover" && <div className="controls">
        <div className="search-row">
          <label className="search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search films, cinemas" aria-label="Search films and cinemas" />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={15} /></button>}</label>
          <button className={"chip filter-button" + (filtersOpen ? " on" : "")} aria-expanded={filtersOpen} aria-label="Filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16} />{chips.length > 0 && <b className="badge">{chips.length}</b>}</button>
          <HelpButton onClick={() => { setHelpTab("help"); setHelpOpen(true); }} />
        </div>
        <div className="filters">
          <button className={"chip" + (english ? " on" : "")} aria-pressed={english} onClick={() => setEnglish(!english)}>ENGLISH SUBS</button>
          <button className={"chip" + (doclab ? " on" : "")} aria-pressed={doclab} onClick={() => setDoclab(!doclab)}>DOCLAB</button>
          <button className={"chip" + (stepFree ? " on" : "")} aria-pressed={stepFree} aria-label="Step-free venues" title="Venues IDFA lists as wheelchair accessible" onClick={() => setStepFree(!stepFree)}><Accessibility size={15} /></button>
          <button className={"chip more" + (filtersOpen ? " on" : "")} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>FILTERS</button>
        </div>
        {filtersOpen && <div className="filter-more">
          <label>Cinema<select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)}><option value="">All cinemas</option>{[...byVenue.values()].sort((a, b) => a.name.localeCompare(b.name)).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
          <label>From<select value={fromTime} onChange={(e) => setFromTime(e.target.value)}><option value="">Any time</option>{[10, 12, 14, 16, 18, 19, 20, 21, 22].map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
          <label className="check"><input type="checkbox" checked={picksOnly} onChange={(e) => setPicksOnly(e.target.checked)} />Picks only</label>
          {picksOnly && people.length > 1 && <label>Whose<select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}><option value="all">Everyone’s</option>{people.map((m) => <option key={m.id} value={m.id}>{m.id === userId ? "Mine" : m.name}</option>)}</select></label>}
          <label className="check"><input type="checkbox" checked={near} disabled={!loc.spot} onChange={(e) => setNear(e.target.checked)} />Within 15 min of me{!loc.spot && " (turn on LOC)"}</label>
          <button className="text-button" onClick={() => setFiltersOpen(false)}>Done</button>
        </div>}
        {dayStrip()}
      </div>}
      {tab === "day" && !nowMode && <div className="controls day-controls">{dayStrip("compact")}</div>}

      <nav className="panel-tabs" role="tablist" aria-label="Views">
        <button role="tab" aria-selected={tab === "discover"} className={tab === "discover" ? "on" : ""} onClick={() => setTab("discover")}>PROGRAMME</button>
        <button role="tab" aria-selected={tab === "day"} className={tab === "day" ? "on" : ""} onClick={() => setTab("day")}>SHOT LIST{list.length ? ` ${list.length}` : ""}</button>
        <button role="tab" aria-selected={tab === "crew"} className={"crew-tab" + (tab === "crew" ? " on" : "")} onClick={() => setTab("crew")}>THE CREW{realMembers.length ? ` ${realMembers.length}` : ""}</button>
      </nav>

      <div className="panel-body">
        {loading && <p className="loading">Loading your group…</p>}
        {tab === "discover" && <section className="programme" aria-label={"Programme for " + info.long}>
          <div className="pg-head">
            <h2 className="an">{today === day ? "Starting soon" + (loc.spot ? " near you" : "") : info.long}</h2>
            <span>{filtered.length} {filtered.length === 1 ? "showing" : "showings"}</span>
          </div>
          {chips.length > 0 && <div className="applied">{chips.map(([l, off]) => <button key={l} className="chip" onClick={off}>{l} ×</button>)}</div>}
          <button className="text-button ideas-button" onClick={() => { setTab("crew"); setCrewSection("ideas"); }}>Not sure where to start? {SUGGESTED.length} shot list ideas<ChevronRight size={14} /></button>
          {!filtered.length && !elsewhere.length && <div className="empty"><p>No showings match{query ? ` “${query}”` : ""} on {info.label}.</p><button className="btn ghost" onClick={() => { setQuery(""); setEnglish(false); setDoclab(false); setStepFree(false); setVenueFilter(""); setFromTime(""); setPicksOnly(false); setNear(false); }}>Clear filters</button></div>}
          <ol className="pg-list">{filtered.map((e) => row(e))}</ol>
          {elsewhere.length > 0 && <><h3 className="pg-other">On other days</h3><ol className="pg-list">{elsewhere.map((e) => row(e, true))}</ol></>}
          <SiteNote onData={() => { setHelpTab("data"); setHelpOpen(true); }} />
        </section>}

        {tab === "day" && (nowMode ? <><NowView stops={list} me={loc.spot} data={data} night={night} userId={userId} onPick={pick} onClose={() => setNowMode(false)} onDay={(d) => { setDay(d); setNowMode(false); }} /><SiteNote onData={() => { setHelpTab("data"); setHelpOpen(true); }} /></>
          : <>
            {!identity && !loading && <div className="start-plan"><p>Your shot list lives here: tap <b>+</b> on any showing. Your name is all it takes, no account.</p>{!nameDialog && joinForm}<button className="text-button" onClick={() => setRecoverOpen(true)}>Planned on another device? Get back in<ChevronRight size={14} /></button></div>}
            {identity && !backedUp && <button className="spot-banner" onClick={() => setSpotOpen(true)}><KeyRound size={15} /><span>Only on this device so far</span><b>Fix this</b></button>}
            {identity && (dayView === "timeline"
              ? <section className="shot-list"><div className="sl-head"><span className="eyebrow">{info.label.toUpperCase()}</span><h2 className="an">{listTitle}</h2>{targetToggle}</div><Timeline stops={list} day={day} onPick={pick} now={now} /></section>
              : <ShotList stops={list} day={day} route={listRoute} title={listTitle} data={data} night={night} userId={userId} canEdit={listCanEdit} now={now} run={run} onPick={pick} onTicket={setTicket}
                onStart={() => { setNowMode(true); setSheet("half"); track("now-open"); }} onDay={setDay} onExplore={() => setTab("discover")} onMap={() => { setSheet("peek"); setFit((f) => f + 1); }} toggle={targetToggle} />)}
            <SiteNote onData={() => { setHelpTab("data"); setHelpOpen(true); }} />
          </>)}

        {tab === "crew" && <section className="crew" aria-label="Your group">
          <div className="crew-head">
            <div><span className="eyebrow">{identity ? `${realMembers.length} OF YOU · ` : ""}{info.label.toUpperCase()}</span><h2 className="an">THE CREW</h2></div>
            <button className="btn invite-button" onClick={share}>+ INVITE</button>
          </div>
          {!identity && !loading && crewSection !== "ideas" ? <div className="start-plan">
            <p>{invite ? "Your friends are planning IDFA together. Add your name to join." : "Plan IDFA with friends: see who has a ticket, who still needs one, and the day everyone is free. Start with your name, then send the invite link."}</p>
            {!nameDialog && joinForm}
            <button className="text-button" onClick={() => setCrewSection("ideas")}>Or start from one of {SUGGESTED.length} shot list ideas<ChevronRight size={14} /></button>
            <button className="text-button" onClick={() => setRecoverOpen(true)}>Already in a group on another device? Get back in<ChevronRight size={14} /></button>
          </div> : <>
            {identity && <div className="avatars">{realMembers.map((m) => <span key={m.id} className="avatar" title={m.display_name} style={{ background: m.color }}>{initials(m.display_name)}</span>)}{!inGroup && <span className="alone">Just you so far. Invite friends to fill the ticket board.</span>}</div>}
            {identity && crewNav}
            {crewSection === "board" && identity && data && night && <>
              <div className="board-head"><h3 className="eyebrow">TICKET BOARD</h3><Legend /></div>
              <TicketBoard data={data} night={night} userId={userId} rows={boardRows} onPick={pick} onSet={setTicket} canWrite={canEditShared} />
              <h3 className="eyebrow">WHEN IS EVERYONE FREE?</h3>
              <FreeGrid data={data} night={night} userId={userId} canWrite={canEditShared} days={remainingDays(today)} onToggle={setFree} wanted={boardRows.filter((e) => data.dh_tickets.some((t) => t.event_id === e.id && t.status === "want"))}
                onPickDay={(d) => { setDay(d); setTab("discover"); setPicksOnly(suggestions.length > 0); }} />
              {lastChange && <p className="last-change">{describe(lastChange, data, night)}{undo && <button className="text-link" onClick={() => { sync!.apply(undo.ops); setUndo(null); }}>Undo</button>}</p>}
              <p className="small">Everyone ticks their own row. DocuHop doesn’t sell tickets or know whether any are left: buy them on IDFA’s site (the IDFA link on each row).</p>
            </>}
            {crewSection === "decide" && data && night && <Decide data={data} night={night} userId={userId} proposals={proposals} onPick={pick} onReact={(id, r) => react(id, r)}
              onDeadline={identity?.role === "organiser" ? (iso) => run([{ t: "update", table: "dh_nights", id: night.night!.id, patch: { vote_deadline: iso } }]) : null}
              onVote={vote} onPreview={(p) => { setPreviewStops(p); if (p) { const f = byId.get(p[0]?.id); if (f) setDay(f.day); setFit((x) => x + 1); } }}
              onPropose={(stops) => { if (night.mine || identity) run([...myRoute.map((s): Op => ({ t: "delete", table: "dh_stops", id: s.rowId! })), ...personalRouteOps(identity!.night_id, userId, night.mine, night.mine?.title || identity!.display_name + "’s shot list", stops).ops], "Replaced your shot list with the draft"); }}
              onUseShared={canEditShared && night.shared ? (stops) => { run(replaceRouteOps(night.shared!, route, stops), "Replaced our shot list with the draft"); setTarget("shared"); setTab("day"); } : null} />}
            {crewSection === "ideas" && <>
              <RouteIdeas suggested proposals={SUGGESTED} members={SUGGESTER} events={byId} previewId={SUGGESTED.some((p) => p.id === previewId) ? previewId : null}
                onPreview={(id) => { setPreviewId(id); const f = id && byId.get(SUGGESTED.find((p) => p.id === id)!.route[0].id); if (f) setDay(f.day); if (id && isPhone()) setSheet("peek"); }}
                onAdopt={async (id) => adoptSuggested(id)} onSelect={pick} busy={busy} currentRoute={[]} />
              {identity && night && proposals.some((p) => p.route.length && p.member_id !== userId) && <RouteIdeas votes={data?.dh_idea_votes ?? []} proposals={proposals.filter((p) => p.member_id !== userId)} members={people} events={byId} previewId={proposals.some((p) => p.id === previewId) ? previewId : null}
                onPreview={(id) => { setPreviewId(id); if (id && isPhone()) setSheet("peek"); }} onAdopt={adoptIdea} onSelect={pick} busy={busy} currentRoute={route} />}
            </>}
            {crewSection === "crews" && data && night && <Crews data={data} night={night} userId={userId} canWrite={canEditShared} shared={route} run={run} onPick={pick} day={day}
              onChooseStops={() => { setTarget("crew"); setTab("discover"); }} onPreview={(p) => setPreviewStops(p)} onPropose={() => {}}
              renderStops={(stops) => <ShotList stops={stops} day={day} route={crewRoute} title={(myCrewName ?? "CREW").toUpperCase() + "’S SHOT LIST"} data={data} night={night} userId={userId} canEdit={canEditShared} now={now} run={run} onPick={pick} onTicket={setTicket}
                onStart={() => { setTarget("crew"); setTab("day"); setNowMode(true); }} onDay={setDay} onExplore={() => { setTarget("crew"); setTab("discover"); }} onMap={() => setSheet("peek")} />} />}
            {crewSection === "activity" && data && night && <section className="activity-panel"><div className="group-strip"><strong>What changed</strong><SyncPill status={status} /></div><ActivityFeed data={data} night={night} /></section>}
          </>}
          <SiteNote onData={() => { setHelpTab("data"); setHelpOpen(true); }} />
        </section>}
      </div>
    </aside>

    <nav className="bottom-tabs" aria-label="Views">{tabs.map(([k, l, Icon]) => <button key={k} className={(tab === k ? "on " : "") + "tab-" + k} aria-current={tab === k ? "page" : undefined} onClick={() => { setTab(k); if (k === "day" && todayHasPlan && day === today) setNowMode(true); }}>
      <Icon size={22} />{l}{k === "crew" && realMembers.length > 1 && <b className="badge">{realMembers.length - 1}</b>}{k === "day" && list.length > 0 && <b className="badge">{list.length}</b>}
    </button>)}</nav>

    {selected && <div className={"modal-backdrop" + (detailSize !== "full" ? " sheet-mode " + detailSize : "")} onClick={() => setSelected(null)}><section className="detail-modal" role="dialog" aria-modal={detailSize === "full"} aria-label={selected.title} onClick={(e) => e.stopPropagation()}>
      <button className="detail-grip" aria-label={detailSize === "full" ? "Show less" : "Show more"} onClick={() => { if (detailDragged.current) { detailDragged.current = false; return; } setDetailSize(detailSize === "peek" ? "half" : detailSize === "half" ? "full" : "peek"); }}
        onPointerDown={(e) => { detailDrag.current = e.clientY; detailDragged.current = false; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerUp={(e) => { const y = detailDrag.current; detailDrag.current = null; if (y == null || Math.abs(e.clientY - y) < 30) return; detailDragged.current = true; resizeDetail(e.clientY < y); }}><span /></button>
      <button className="modal-close" autoFocus aria-label="Close details" onClick={() => setSelected(null)}><X size={21} /></button>
      {isVenue(selected.id) ? <>
        <span className="eyebrow">CINEMA · {info.label.toUpperCase()}</span><h2 className="an">{selected.title}</h2>
        <ActivityInfo item={selected} me={loc.spot} />
        <h3 className="eyebrow">ON {info.label.toUpperCase()}</h3>
        <ol className="pg-list">{showingsAt(selected.venueId, day).map((e) => row(e))}</ol>
        {!showingsAt(selected.venueId, day).length && <p className="small">Nothing here on {info.label}. {showingsAt(selected.venueId).filter((e) => e.end > now).length} showings on other days.</p>}
      </> : <>
        <span className="eyebrow">{dayInfo(selected.day).label.toUpperCase()} · {selected.hall.toUpperCase()}</span><h2 className="an">{selected.title}</h2>
        <ActivityInfo item={selected} me={loc.spot} />
        <div className="detail-actions">
          {(!identity || (canEditShared && night?.shared)) && (route.some((s) => s.id === selected.id)
            ? <button className="btn ghost" onClick={() => removeFrom(selected.id, "shared")}><Check size={16} />In our shot list · remove</button>
            : <button className="btn" onClick={() => addTo(selected.id, "shared")}><Plus size={16} />Add to our shot list</button>)}
          {myRoute.some((s) => s.id === selected.id)
            ? <button className="btn ghost" onClick={() => removeFrom(selected.id, "personal")}><Check size={16} />In my shot list · remove</button>
            : <button className="btn ghost" onClick={() => addTo(selected.id, "personal")}><Plus size={16} />Add to my shot list</button>}
          {target === "crew" && crewRoute && (crewStops.some((s) => s.id === selected.id)
            ? <button className="btn ghost" onClick={() => removeFrom(selected.id, "crew")}><Check size={16} />In {myCrewName}’s shot list · remove</button>
            : <button className="btn ghost" onClick={() => addTo(selected.id, "crew")}><Plus size={16} />Add to {myCrewName}’s shot list</button>)}
          <a className="btn ghost" href={selected.url} target="_blank" rel="noreferrer" onClick={() => track("idfa-page")}>TICKETS ON IDFA<ArrowUpRight size={14} /></a>
        </div>
        {!fits(list.filter((s) => s.id !== selected.id), selected) && <p className="time-warning">Clashes with something in {listTitle.toLowerCase()}, or there’s not enough time to get there.</p>}
        <h3 className="eyebrow">YOUR TICKET</h3>
        <TicketButtons value={myTicket(selected.id)} onChange={(s) => setTicket(selected.id, s)} title={selected.title} big />
        {inGroup && <p className="detail-group"><TicketChips data={data} night={night} eventId={selected.id} userId={userId} /> {ticketSummary(data, night, userId, selected.id).line || "Nobody in your group has said yet."}</p>}
        <h3 className="eyebrow">YOUR REACTION</h3>
        <ReactionButtons big value={myReaction(selected.id)} onChange={(r) => react(selected.id, r, note)} title={selected.title} />
        <label className="note-label">Why you’d like to go <span>(optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={240} placeholder="A note for your group…" /></label>
        <button className="text-button" onClick={() => react(selected.id, myReaction(selected.id) ?? "up", note)}>Save my note{myReaction(selected.id) ? "" : " (as Up for it)"}</button>
        {suggesters(selected.id).length > 0 && <div className="detail-suggestions">{suggesters(selected.id).map((s) => <p key={s.member_id}><b>{nameOf(s.member_id)}</b> · {REACTIONS.find((x) => x.key === s.reaction)!.label}{s.note ? ": " + s.note : ""}</p>)}</div>}
        {otherShowings(selected).length > 0 && <><h3 className="eyebrow">OTHER SHOWINGS</h3><ol className="other-showings">{otherShowings(selected).map((e) => {
          const fit = fits(list.filter((s) => s.id !== selected.id), e), past = e.end <= now;
          return <li key={e.id} className={past ? "past" : ""}><button onClick={() => pick(e)}><b>{dayInfo(e.day).weekday} {dayInfo(e.day).num} · {clock(e.start)}</b><small>{e.hall}{e.english ? " · EN subs" : ""}{!past && (fit ? " · fits your plan" : " · clashes")}</small></button></li>;
        })}</ol>{list.some((s) => s.id === selected.id) && alternatives(list, selected.id).length > 0 && <p className="small">Need another time? Fix in your shot list swaps it in one tap.</p>}</>}
      </>}
    </section></div>}

    <Onboarding hold={doorPending || recoverOpen || nameDialog} inNight={!!identity} helpOpen={helpOpen} setHelpOpen={setHelpOpen} helpTab={helpTab} show={(p: Place) => {
      setSelected(null); setPreviewId(null);
      if (p.tab) setTab(p.tab);
      if (p.crew) setCrewSection(p.crew);
      if (isPhone()) setSheet(p.tab === "crew" ? "full" : "half");
    }} />
    {spotOpen && identity && sync && <KeepSpot name={identity.display_name} nightName={night?.night?.name ?? "this group"} saved={sync.savedPersonalLink()}
      onCreate={async () => { const link = await sync!.newPersonalLink(invite); setLinkMade((n) => n + 1); return link; }} onClose={() => setSpotOpen(false)}
      emailReady={false} onEmail={async () => ""} onSaved={() => sync!.markBackedUp()} />}
    {menuOpen && identity && <YourSpot name={identity.display_name} backedUp={backedUp} onClose={() => setMenuOpen(false)} onOtherDevice={() => { setMenuOpen(false); setDeviceOpen(true); }} onLink={() => { setMenuOpen(false); setSpotOpen(true); }}
      onName={() => { setMenuOpen(false); setName(identity.display_name); setColor(identity.color); setNameDialog(true); }} />}
    {deviceOpen && identity && sync && <OtherDevice name={identity.display_name} saved={sync.savedPersonalLink()} emailReady={false} onEmail={async () => ""} onSaved={() => sync!.markBackedUp()} onClose={() => setDeviceOpen(false)}
      onCreate={async () => { const link = await sync!.newPersonalLink(invite); setLinkMade((n) => n + 1); return link; }} />}
    {doors && <TwoDoors onNew={() => { setDoorChosen(true); setNameDialog(true); }} onBack={() => { setDoorChosen(true); setRecoverOpen(true); }} onLook={() => setDoorChosen(true)} />}
    {recoverOpen && sync && <RecoverByEmail emailReady={false} onSend={async () => {}} onClose={() => setRecoverOpen(false)} />}
    {gmapsOpen && <GoogleMapsSheet stops={gmaps.stops} title={gmaps.title} onClose={() => setGmapsOpen(false)} />}
    {shareOpen && identity && invite && <ShareDialog invite={invite} nightId={identity.night_id} canPlan={identity.role !== "viewer"} onClose={() => setShareOpen(false)} />}
    {switchLink && sync?.pendingLink && <div className="modal-backdrop"><section className="name-modal" role="dialog" aria-modal="true" aria-label="Open this personal link?">
      <KeyRound size={30} /><h2 className="an">Open this personal link?</h2>
      <p>This browser is already someone in a group. The link switches it to the person the link belongs to, with their groups. This browser’s current spot stays safe only if that person has a personal link of their own.</p>
      <button className="btn" onClick={async () => { try { await sync!.useLink(sync!.pendingLink!); location.reload(); } catch (e) { setSwitchLink(false); setError((e as Error).message); } }}>Switch to the link’s person<ArrowUpRight size={16} /></button>
      <button className="text-button" onClick={() => { sync!.pendingLink = null; setSwitchLink(false); }}>Stay as I am</button>
    </section></div>}
    {nameDialog && <div className="modal-backdrop" onClick={() => setNameDialog(false)}><section className="name-modal" role="dialog" aria-modal="true" aria-label={identity ? "Your name" : "Start your plan"} onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" aria-label="Close" onClick={() => setNameDialog(false)}><X size={20} /></button>
      <h2 className="an">{identity ? "YOUR NAME" : invite ? "JOIN YOUR FRIENDS" : "START YOUR SHOT LIST"}</h2>
      <p>{identity ? "This is how your name appears to the group." : invite ? "Add your name to plan with the group." : "Your name is all it takes: your shot list is saved, and you can invite friends later."}</p>
      {error && <p className="dialog-error" role="alert">{error}</p>}{joinForm}
    </section></div>}
  </main>;
}
