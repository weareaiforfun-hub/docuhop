// Checks DocuHop's access rules (dh_ tables in the shared to-one project) against the real database with three
// anonymous users: an organiser, a friend who joins by invite, and an outsider. Creates two groups named
// "access-check" and tags its sign-ins app=docuhop, so the daily retention job removes them once those groups are
// deleted. Usage: npm run check-access
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const client = async () => {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInAnonymously({ options: { data: { app: "docuhop", purpose: "access-check" } } });
  if (error) throw error;
  return Object.assign(c, { uid: data.user.id });
};
let failures = 0;
const ok = (label, cond, extra = "") => { if (!cond) failures++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  · " + extra : ""}`); };
const id = () => crypto.randomUUID();

const org = await client(), pat = await client(), out = await client();

const { data: token, error: ce } = await org.rpc("dh_create_night", { p_name: "access-check", p_display_name: "Org", p_color: "#183b35" });
ok("organiser creates a night and gets an invite token", !ce && /^[0-9a-f]{64}$/.test(token), ce?.message);
const night = (await org.from("dh_nights").select("id").single()).data.id;
const shared = (await org.from("dh_routes").select("id").eq("kind", "shared").single()).data.id;

const seen = await Promise.all(["dh_nights", "dh_members", "dh_routes", "dh_stops", "dh_activity"].map((t) => out.from(t).select("id").eq(t === "dh_nights" ? "id" : "night_id", night)));
ok("outsider sees nothing of the night", seen.every((r) => !r.error && r.data.length === 0));
const bad = await out.rpc("dh_join_night", { p_token: "0".repeat(64), p_display_name: "X", p_color: "#000000" });
ok("a wrong invite token is refused", !!bad.error, bad.error?.message);
const intrude = await out.from("dh_stops").insert({ id: id(), night_id: night, route_id: shared, pos: 1, event_id: "9561b3da" });
ok("outsider cannot add stops", !!intrude.error, intrude.error?.code);

const j = await pat.rpc("dh_join_night", { p_token: token, p_display_name: "Pat", p_color: "#b9452f" });
ok("friend joins with the invite", j.data === night, j.error?.message);
const members = await pat.from("dh_members").select("display_name,role").order("joined_at");
ok("friend sees both members and roles", members.data?.length === 2, members.data?.map((m) => `${m.display_name}:${m.role}`).join(", "));

const stop = id();
const add = await pat.from("dh_stops").insert({ id: stop, night_id: night, route_id: shared, pos: 1, event_id: "9561b3da" });
ok("friend adds a stop to the shared route", !add.error, add.error?.message);
const [mv, tm] = await Promise.all([
  org.from("dh_stops").update({ pos: 0.5 }).eq("id", stop),
  pat.from("dh_stops").update({ arrival: "20:10", duration: 101 }).eq("id", stop),
]);
const after = (await org.from("dh_stops").select("pos,arrival,duration,updated_by").eq("id", stop).single()).data;
ok("simultaneous move + time change both survive", !mv.error && !tm.error && after.pos === 0.5 && after.arrival === "20:10" && after.duration === 101, JSON.stringify(after));

const promote = await pat.from("dh_members").update({ role: "organiser" }).eq("user_id", pat.uid);
ok("friend cannot promote their own role", !!promote.error, promote.error?.code);
const otherNight = (await org.rpc("dh_create_night", { p_name: "access-check", p_display_name: "Org", p_color: "#183b35" })).data;
const hop = await pat.from("dh_stops").update({ night_id: night, route_id: shared }).eq("id", stop);
ok("stops can't be moved to another route or night", !!hop.error, hop.error?.code);
void otherNight;

const mine = id();
const pr = await pat.from("dh_routes").insert({ id: mine, night_id: night, kind: "personal", owner_user: pat.uid, title: "Pat's route" });
const ps = await pat.from("dh_stops").insert([
  { id: id(), night_id: night, route_id: mine, pos: 1, event_id: "b584a002", arrival: "20:00", duration: 106, reason: "Dinner first" },
  { id: id(), night_id: night, route_id: mine, pos: 2, event_id: "f3cfc6d0", arrival: "20:00", duration: 35, fixed: true },
], { defaultToNull: false });
ok("friend saves a personal route", !pr.error && !ps.error, pr.error?.message || ps.error?.message);
const meddle = await org.from("dh_stops").insert({ id: id(), night_id: night, route_id: mine, pos: 3, event_id: "f3d19501" });
const meddle2 = await org.from("dh_stops").update({ arrival: "23:00" }).eq("route_id", mine).select();
ok("others cannot edit someone's personal route", !!meddle.error && meddle2.data?.length === 0, meddle.error?.code);
const fakeOwner = await org.from("dh_routes").insert({ id: id(), night_id: night, kind: "personal", owner_user: pat.uid, title: "x" });
ok("nobody can create a personal route in someone else's name", !!fakeOwner.error, fakeOwner.error?.code);

const adopted = await org.rpc("dh_adopt_route", { p_route: mine });
const sharedNow = (await pat.from("dh_stops").select("event_id,fixed,reason").eq("route_id", shared).order("pos")).data;
ok("adopting a route idea copies its stops into the shared route", adopted.data === 2 && sharedNow.length === 2 && sharedNow[1].fixed && sharedNow[0].reason === "Dinner first", JSON.stringify(sharedNow));

const r1 = await pat.from("dh_reactions").insert({ night_id: night, event_id: "b584a002", reaction: "must" });
const r2 = await pat.from("dh_reactions").insert({ night_id: night, user_id: org.uid, event_id: "f3cfc6d0", reaction: "skip" });
ok("friend reacts, but not in someone else's name", !r1.error && !!r2.error, r1.error?.message || r2.error?.code);

const lock = await org.from("dh_nights").update({ route_locked_at: new Date(Date.now() - 60000).toISOString() }).eq("id", night);
const lockByPat = await pat.from("dh_nights").update({ route_locked_at: null }).eq("id", night).select();
const lockedAdd = await pat.from("dh_stops").insert({ id: id(), night_id: night, route_id: shared, pos: 9, event_id: "f3d19501" });
const orgAdd = await org.from("dh_stops").insert({ id: id(), night_id: night, route_id: shared, pos: 9, event_id: "f3d19501" });
ok("a locked route refuses friends' edits but not the organiser's", !lock.error && lockByPat.data?.length === 0 && !!lockedAdd.error && !orgAdd.error, lockedAdd.error?.code);

const activity = (await pat.from("dh_activity").select("kind").eq("night_id", night)).data.map((a) => a.kind);
ok("activity log records changes (and one entry for an adopt)", activity.includes("stop_add") && activity.includes("stop_move") && activity.includes("route_adopt") && activity.includes("member_join"), activity.join(","));

// The ticket board and the free-days grid: everyone sets only their own, members read, outsiders see nothing.
const t1 = await pat.from("dh_tickets").insert({ id: id(), night_id: night, event_id: "f3cfc6d0", status: "want" }).select().single();
const t2 = await pat.from("dh_tickets").insert({ id: id(), night_id: night, user_id: org.uid, event_id: "f3cfc6d0", status: "got" });
ok("friend ticks a ticket status, but not in someone else's name", !t1.error && !!t2.error, t1.error?.message || t2.error?.code);
const t3 = await pat.from("dh_tickets").update({ status: "got" }).eq("id", t1.data?.id).select();
const t4 = await org.from("dh_tickets").update({ status: "skip" }).eq("id", t1.data?.id).select();
ok("friend changes their own ticket status; others can't", !t3.error && t3.data?.[0]?.status === "got" && (t4.data?.length ?? 0) === 0, t3.error?.message);
const t5 = await pat.from("dh_tickets").update({ event_id: "f3d19501" }).eq("id", t1.data?.id);
ok("a ticket row can't be moved to another showing", !!t5.error, t5.error?.code);
const f1 = await pat.from("dh_free").insert({ id: id(), night_id: night, day: 9 });
const f2 = await pat.from("dh_free").insert({ id: id(), night_id: night, user_id: org.uid, day: 9 });
const f3 = await pat.from("dh_free").insert({ id: id(), night_id: night, day: 11 });
ok("friend marks a free day for themselves only, within the festival", !f1.error && !!f2.error && !!f3.error, f1.error?.message || f2.error?.code);
const orgSees = await org.from("dh_tickets").select("status").eq("night_id", night);
const outSees = await Promise.all(["dh_tickets", "dh_free"].map((t) => out.from(t).select("id").eq("night_id", night)));
ok("members see the board; outsiders see nothing of it", orgSees.data?.length === 1 && outSees.every((r) => !r.error && r.data.length === 0));
const kinds = (await pat.from("dh_activity").select("kind").eq("night_id", night)).data.map((a) => a.kind);
ok("ticket changes show up in the activity list", kinds.includes("ticket"), kinds.join(","));
const meet = await org.from("dh_meetups").insert({ id: id(), night_id: night, day: 4, at: "19:30", event_id: "d01a81d2", created_by: org.uid });
const badDay = await org.from("dh_meetups").insert({ id: id(), night_id: night, day: 12, at: "19:30", event_id: "d01a81d2", created_by: org.uid });
ok("meet-ups carry a festival day (0 to 10)", !meet.error && !!badDay.error, meet.error?.message);

// Personal links: another device signs in as the same member; a new link turns the old one off.
const linkEmail = (uid) => `m-${uid}@users.docuhop.arian-shafa.xyz`;
const outLink = await out.rpc("dh_personal_link");
ok("someone in no group can't get a personal link", !!outLink.error, outLink.error?.message);
const { data: secret, error: le } = await pat.rpc("dh_personal_link");
ok("a member gets a personal link secret", !le && /^[0-9a-f]{64}$/.test(secret), le?.message);
const device = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const signedIn = await device.auth.signInWithPassword({ email: linkEmail(pat.uid), password: secret });
const deviceSees = (await device.from("dh_stops").select("id").eq("night_id", night)).data ?? [];
const memberNight = await device.rpc("dh_member_night", { p_token: token });
ok("the link opens the same member, with their night, on a new device", signedIn.data.user?.id === pat.uid && deviceSees.length > 0 && memberNight.data === night, signedIn.error?.message);
const strangerNight = await out.rpc("dh_member_night", { p_token: token });
ok("knowing the invite token alone doesn't reveal the night id", !strangerNight.error && strangerNight.data === null);
const { data: secret2 } = await pat.rpc("dh_personal_link");
const oldLink = await createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: linkEmail(pat.uid), password: secret });
const newLink = await createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: linkEmail(pat.uid), password: secret2 });
ok("a new personal link turns the old one off", !!oldLink.error && newLink.data.user?.id === pat.uid, oldLink.error?.message);
const stillIn = await pat.from("dh_members").select("id").eq("night_id", night);
ok("the original device stays signed in after a new link", !stillIn.error && stillIn.data.length > 0);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
