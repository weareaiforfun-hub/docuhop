-- ===== from MuseumHop 20261101180000_museumhop.sql =====
-- DocuHop: the MuseumHop engine for IDFA 2026 (12–22 Nov). It lives in the shared to-one project, so its tables and
-- functions carry the dh_ prefix. MuseumHop's own na_ objects are not touched.
-- One "night" per friend group. Everyone signs in anonymously today; because membership is keyed on auth.uid(),
-- upgrading an anonymous user to a real account later keeps all their data. Nights are reachable only through an
-- invite token (stored hashed), and every table is scoped by night_id, so strangers' groups never see each other.
-- Every table has an opaque uuid primary key: Realtime DELETE events carry only the primary key and can't be
-- filtered, so this keeps them free of anything meaningful.

create table public.dh_nights (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'IDFA 2026' check (char_length(name) between 1 and 80),
  event_date date not null default '2026-11-22',
  vote_deadline timestamptz,
  route_locked_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.dh_members (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  display_name text not null check (char_length(display_name) between 1 and 32),
  color text not null default '#2f6db5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  role text not null default 'planner' check (role in ('organiser', 'planner', 'viewer')),
  fictional boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (night_id, user_id)
);

create table public.dh_invites (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  token_hash text not null unique,
  role text not null default 'planner' check (role in ('planner', 'viewer')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.dh_crews (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#2f6db5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create table public.dh_crew_members (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  crew_id uuid not null references public.dh_crews(id) on delete cascade,
  user_id uuid not null,
  unique (night_id, user_id) -- one crew per person per night
);

-- Shared route (one per night), personal routes (one per person; these are the "route ideas") and crew routes.
create table public.dh_routes (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  kind text not null check (kind in ('shared', 'personal', 'crew')),
  owner_user uuid,
  crew_id uuid references public.dh_crews(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 100),
  description text not null default '' check (char_length(description) <= 1500),
  practical text not null default '' check (char_length(practical) <= 2000),
  updated_at timestamptz not null default now(),
  check ((kind = 'personal') = (owner_user is not null)),
  check ((kind = 'crew') = (crew_id is not null))
);
create unique index dh_routes_shared on public.dh_routes (night_id) where kind = 'shared';
create unique index dh_routes_personal on public.dh_routes (night_id, owner_user) where kind = 'personal';
create unique index dh_routes_crew on public.dh_routes (crew_id) where kind = 'crew';

-- One row per stop, ordered by a fractional position: a move rewrites only `pos`, a time change only
-- `arrival`/`duration`, so concurrent edits by different people both survive.
create table public.dh_stops (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  route_id uuid not null references public.dh_routes(id) on delete cascade,
  pos double precision not null,
  event_id text not null check (event_id ~ '^[a-z0-9:_-]{1,160}$'),
  arrival text not null default '' check (arrival = '' or arrival ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  duration int not null default 90 check (duration between 1 and 900),
  reason text not null default '' check (char_length(reason) <= 500),
  practical text not null default '' check (char_length(practical) <= 600),
  transfer text not null default '' check (char_length(transfer) <= 400),
  fixed boolean not null default false,
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (route_id, event_id)
);
create index dh_stops_route on public.dh_stops (route_id, pos);

create table public.dh_reactions (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  event_id text not null check (event_id ~ '^[a-z0-9:_-]{1,160}$'),
  reaction text not null check (reaction in ('must', 'up', 'skip')),
  note text not null default '' check (char_length(note) <= 240),
  updated_at timestamptz not null default now(),
  unique (night_id, user_id, event_id)
);

create table public.dh_idea_votes (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  route_id uuid not null references public.dh_routes(id) on delete cascade,
  unique (night_id, user_id)
);

create table public.dh_meetups (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  day int not null default 0 check (day between 0 and 10), -- festival day: 0 = Thu 12 Nov … 10 = Sun 22 Nov
  at text not null check (at ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  event_id text not null check (event_id ~ '^[a-z0-9:_-]{1,160}$'),
  note text not null default '' check (char_length(note) <= 240),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.dh_meetup_crews (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  meetup_id uuid not null references public.dh_meetups(id) on delete cascade,
  crew_id uuid not null references public.dh_crews(id) on delete cascade,
  confirmed_at timestamptz,
  arrived_at timestamptz,
  unique (meetup_id, crew_id)
);

-- Who changed what, written only by triggers. Feeds the activity list.
create table public.dh_activity (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  user_id uuid,
  kind text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index dh_activity_night on public.dh_activity (night_id, created_at desc);

/* ---------- access helpers ---------- */

-- The caller's role in a night, or null. Security definer avoids RLS recursion on dh_members.
create function public.dh_role(n uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from dh_members where night_id = n and user_id = auth.uid();
$$;

create function public.dh_can_write(n uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.dh_role(n) in ('organiser', 'planner'), false);
$$;

-- Who may change a route and its stops.
create function public.dh_can_edit_route(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case ro.kind
    when 'shared' then public.dh_can_write(ro.night_id)
      and (nt.route_locked_at is null or nt.route_locked_at > now() or public.dh_role(ro.night_id) = 'organiser')
    when 'personal' then ro.owner_user = auth.uid() and public.dh_role(ro.night_id) is not null
    when 'crew' then public.dh_can_write(ro.night_id)
      and exists (select 1 from dh_crew_members cm where cm.crew_id = ro.crew_id and cm.user_id = auth.uid())
  end
  from dh_routes ro join dh_nights nt on nt.id = ro.night_id where ro.id = r;
$$;

/* ---------- row level security ---------- */

alter table public.dh_nights enable row level security;
alter table public.dh_members enable row level security;
alter table public.dh_invites enable row level security;
alter table public.dh_crews enable row level security;
alter table public.dh_crew_members enable row level security;
alter table public.dh_routes enable row level security;
alter table public.dh_stops enable row level security;
alter table public.dh_reactions enable row level security;
alter table public.dh_idea_votes enable row level security;
alter table public.dh_meetups enable row level security;
alter table public.dh_meetup_crews enable row level security;
alter table public.dh_activity enable row level security;

create policy "members read night" on public.dh_nights for select using (public.dh_role(id) is not null);
create policy "organiser edits night" on public.dh_nights for update
  using (public.dh_role(id) = 'organiser') with check (public.dh_role(id) = 'organiser');

create policy "members read members" on public.dh_members for select using (public.dh_role(night_id) is not null);
create policy "edit own member row" on public.dh_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Invites are read through the organiser's own view only; joining goes through dh_join_night.
create policy "organiser reads invites" on public.dh_invites for select using (public.dh_role(night_id) = 'organiser');

create policy "members read crews" on public.dh_crews for select using (public.dh_role(night_id) is not null);
create policy "planners add crews" on public.dh_crews for insert with check (public.dh_can_write(night_id));
create policy "planners edit crews" on public.dh_crews for update
  using (public.dh_can_write(night_id)) with check (public.dh_can_write(night_id));
create policy "planners remove crews" on public.dh_crews for delete using (public.dh_can_write(night_id));

create policy "members read crew members" on public.dh_crew_members for select using (public.dh_role(night_id) is not null);
create policy "planners add crew members" on public.dh_crew_members for insert with check (
  public.dh_can_write(night_id)
  and exists (select 1 from dh_crews c where c.id = crew_id and c.night_id = dh_crew_members.night_id)
  and exists (select 1 from dh_members m where m.night_id = dh_crew_members.night_id and m.user_id = dh_crew_members.user_id));
create policy "planners remove crew members" on public.dh_crew_members for delete using (public.dh_can_write(night_id));

create policy "members read routes" on public.dh_routes for select using (public.dh_role(night_id) is not null);
create policy "add own personal or crew route" on public.dh_routes for insert with check (
  (kind = 'personal' and owner_user = auth.uid() and public.dh_role(night_id) is not null)
  or (kind = 'crew' and public.dh_can_write(night_id)
      and exists (select 1 from dh_crews c where c.id = crew_id and c.night_id = dh_routes.night_id)));
create policy "editors update routes" on public.dh_routes for update
  using (public.dh_can_edit_route(id)) with check (public.dh_can_edit_route(id));
create policy "owners remove personal routes" on public.dh_routes for delete using (kind = 'personal' and owner_user = auth.uid());

create policy "members read stops" on public.dh_stops for select using (public.dh_role(night_id) is not null);
create policy "editors add stops" on public.dh_stops for insert with check (
  public.dh_can_edit_route(route_id) and exists (select 1 from dh_routes r where r.id = route_id and r.night_id = dh_stops.night_id));
create policy "editors update stops" on public.dh_stops for update
  using (public.dh_can_edit_route(route_id)) with check (public.dh_can_edit_route(route_id));
create policy "editors remove stops" on public.dh_stops for delete using (public.dh_can_edit_route(route_id));

create policy "members read reactions" on public.dh_reactions for select using (public.dh_role(night_id) is not null);
create policy "add own reaction" on public.dh_reactions for insert
  with check (user_id = auth.uid() and public.dh_can_write(night_id));
create policy "edit own reaction" on public.dh_reactions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.dh_can_write(night_id));
create policy "remove own reaction" on public.dh_reactions for delete using (user_id = auth.uid());

create policy "members read idea votes" on public.dh_idea_votes for select using (public.dh_role(night_id) is not null);
create policy "cast own idea vote" on public.dh_idea_votes for insert with check (
  user_id = auth.uid() and public.dh_can_write(night_id)
  and exists (select 1 from dh_routes r where r.id = route_id and r.night_id = dh_idea_votes.night_id and r.kind = 'personal'));
create policy "change own idea vote" on public.dh_idea_votes for update
  using (user_id = auth.uid()) with check (user_id = auth.uid()
    and exists (select 1 from dh_routes r where r.id = route_id and r.night_id = dh_idea_votes.night_id and r.kind = 'personal'));
create policy "remove own idea vote" on public.dh_idea_votes for delete using (user_id = auth.uid());

create policy "members read meetups" on public.dh_meetups for select using (public.dh_role(night_id) is not null);
create policy "planners add meetups" on public.dh_meetups for insert with check (public.dh_can_write(night_id) and created_by = auth.uid());
create policy "planners edit meetups" on public.dh_meetups for update
  using (public.dh_can_write(night_id)) with check (public.dh_can_write(night_id));
create policy "planners remove meetups" on public.dh_meetups for delete using (public.dh_can_write(night_id));

-- A crew's confirmation / arrival can only be set by a member of that crew.
create policy "members read meetup crews" on public.dh_meetup_crews for select using (public.dh_role(night_id) is not null);
create policy "crew members confirm" on public.dh_meetup_crews for insert with check (
  public.dh_can_write(night_id)
  and exists (select 1 from dh_crew_members cm where cm.crew_id = dh_meetup_crews.crew_id and cm.user_id = auth.uid())
  and exists (select 1 from dh_meetups mt where mt.id = meetup_id and mt.night_id = dh_meetup_crews.night_id));
create policy "crew members update confirmation" on public.dh_meetup_crews for update
  using (exists (select 1 from dh_crew_members cm where cm.crew_id = dh_meetup_crews.crew_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from dh_crew_members cm where cm.crew_id = dh_meetup_crews.crew_id and cm.user_id = auth.uid()));
create policy "crew members withdraw" on public.dh_meetup_crews for delete
  using (exists (select 1 from dh_crew_members cm where cm.crew_id = dh_meetup_crews.crew_id and cm.user_id = auth.uid()));

create policy "members read activity" on public.dh_activity for select using (public.dh_role(night_id) is not null);

/* ---------- guards and activity triggers ---------- */

create function public.dh_touch_stop() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and (select count(*) from dh_stops where route_id = new.route_id) >= 80 then
    raise exception 'A shot list can have at most 80 showings.';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger dh_stops_touch before insert or update on public.dh_stops for each row execute function public.dh_touch_stop();

create function public.dh_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_kind text; v_data jsonb := '{}';
begin
  if current_setting('dh.quiet', true) = 'on' then return null; end if;
  r := case when tg_op = 'DELETE' then old else new end;
  -- Rows removed because their whole night is being deleted.
  if not exists (select 1 from dh_nights where id = r.night_id) then return null; end if;
  if tg_table_name = 'dh_stops' then
    if tg_op = 'UPDATE' and old.pos is not distinct from new.pos and old.arrival is not distinct from new.arrival
       and old.duration is not distinct from new.duration then return null; end if;
    v_kind := case tg_op when 'INSERT' then 'stop_add' when 'DELETE' then 'stop_remove'
              else case when old.pos is distinct from new.pos then 'stop_move' else 'stop_time' end end;
    v_data := jsonb_build_object('event_id', r.event_id, 'route_id', r.route_id,
      'route_kind', (select kind from dh_routes where id = r.route_id), 'arrival', r.arrival, 'duration', r.duration,
      'changed', case when tg_op = 'UPDATE' and old.arrival is not distinct from new.arrival then 'duration' else 'arrival' end);
  elsif tg_table_name = 'dh_reactions' then
    if tg_op = 'UPDATE' and old.reaction = new.reaction then return null; end if;
    v_kind := case when tg_op = 'DELETE' then 'reaction_clear' else 'reaction' end;
    v_data := jsonb_build_object('event_id', r.event_id, 'reaction', r.reaction);
  elsif tg_table_name = 'dh_members' then
    if tg_op <> 'INSERT' then return null; end if;
    v_kind := 'member_join'; v_data := jsonb_build_object('name', r.display_name);
  elsif tg_table_name = 'dh_crews' then
    if tg_op <> 'INSERT' then return null; end if;
    v_kind := 'crew_add'; v_data := jsonb_build_object('name', r.name);
  elsif tg_table_name = 'dh_tickets' then
    if tg_op = 'UPDATE' and old.status = new.status then return null; end if;
    v_kind := case when tg_op = 'DELETE' then 'ticket_clear' else 'ticket' end;
    v_data := jsonb_build_object('event_id', r.event_id, 'status', r.status);
  elsif tg_table_name = 'dh_meetups' then
    if tg_op <> 'INSERT' then return null; end if;
    v_kind := 'meetup_add'; v_data := jsonb_build_object('event_id', r.event_id, 'at', r.at, 'day', r.day);
  end if;
  insert into dh_activity (night_id, user_id, kind, data) values (r.night_id, auth.uid(), v_kind, v_data);
  return null;
end $$;
create trigger dh_stops_log after insert or update or delete on public.dh_stops for each row execute function public.dh_log();
create trigger dh_reactions_log after insert or update or delete on public.dh_reactions for each row execute function public.dh_log();
create trigger dh_members_log after insert on public.dh_members for each row execute function public.dh_log();
create trigger dh_crews_log after insert on public.dh_crews for each row execute function public.dh_log();
create trigger dh_meetups_log after insert on public.dh_meetups for each row execute function public.dh_log();

/* ---------- RPCs ---------- */

-- Create a night with its shared route and a planner invite; the caller becomes organiser. Returns the invite token.
create function public.dh_create_night(p_name text, p_display_name text, p_color text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_night uuid; v_token text := encode(gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into dh_nights (name, created_by) values (coalesce(nullif(trim(p_name), ''), 'IDFA 2026'), auth.uid())
    returning id into v_night;
  insert into dh_members (night_id, user_id, display_name, color, role)
    values (v_night, auth.uid(), trim(p_display_name), p_color, 'organiser');
  insert into dh_routes (night_id, kind, title) values (v_night, 'shared', 'Our route');
  insert into dh_invites (night_id, token_hash, role) values (v_night, encode(digest(v_token, 'sha256'), 'hex'), 'planner');
  return v_token;
end $$;

-- Join (or rename yourself in) the night an invite token points to. Returns the night id.
create function public.dh_join_night(p_token text, p_display_name text, p_color text, p_fictional boolean default false)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_invite dh_invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into v_invite from dh_invites
    where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and revoked_at is null;
  if v_invite.id is null then raise exception 'invite not found'; end if;
  if not exists (select 1 from dh_members where night_id = v_invite.night_id and user_id = auth.uid())
     and (select count(*) from dh_members where night_id = v_invite.night_id) >= 100 then
    raise exception 'This group is full.';
  end if;
  insert into dh_members (night_id, user_id, display_name, color, role, fictional)
    values (v_invite.night_id, auth.uid(), trim(p_display_name), p_color, v_invite.role, p_fictional)
    on conflict (night_id, user_id) do update set display_name = excluded.display_name, color = excluded.color;
  return v_invite.night_id;
end $$;

-- Replace the shared route's stops with a copy of a personal route (a "route idea"), as one transaction and one
-- activity entry. Returns the number of stops.
create function public.dh_adopt_route(p_route uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_src dh_routes; v_shared uuid; v_n int;
begin
  select * into v_src from dh_routes where id = p_route and kind = 'personal';
  if v_src.id is null then raise exception 'route idea not found'; end if;
  select id into v_shared from dh_routes where night_id = v_src.night_id and kind = 'shared';
  if not public.dh_can_edit_route(v_shared) then raise exception 'not allowed to change the shared route'; end if;
  select count(*) into v_n from dh_stops where route_id = p_route;
  if v_n = 0 then raise exception 'Add at least one stop before using this route.'; end if;
  perform set_config('dh.quiet', 'on', true);
  delete from dh_stops where route_id = v_shared;
  insert into dh_stops (night_id, route_id, pos, event_id, arrival, duration, reason, practical, transfer, fixed)
    select night_id, v_shared, pos, event_id, arrival, duration, reason, practical, transfer, fixed from dh_stops where route_id = p_route;
  perform set_config('dh.quiet', 'off', true);
  insert into dh_activity (night_id, user_id, kind, data)
    values (v_src.night_id, auth.uid(), 'route_adopt', jsonb_build_object('route_id', p_route, 'title', v_src.title));
  return v_n;
end $$;

revoke execute on function public.dh_create_night(text, text, text) from public, anon;
revoke execute on function public.dh_join_night(text, text, text, boolean) from public, anon;
revoke execute on function public.dh_adopt_route(uuid) from public, anon;
grant execute on function public.dh_create_night(text, text, text) to authenticated;
grant execute on function public.dh_join_night(text, text, text, boolean) to authenticated;
grant execute on function public.dh_adopt_route(uuid) to authenticated;

alter publication supabase_realtime add table
  public.dh_nights, public.dh_members, public.dh_crews, public.dh_crew_members, public.dh_routes, public.dh_stops,
  public.dh_reactions, public.dh_idea_votes, public.dh_meetups, public.dh_meetup_crews, public.dh_activity;

-- Row policies decide WHICH rows someone may update; these grants decide WHICH columns. Without them a member could
-- promote their own role, or move a stop or route into another night.
revoke update on public.dh_nights, public.dh_members, public.dh_routes, public.dh_stops, public.dh_reactions,
  public.dh_idea_votes, public.dh_crews, public.dh_meetups, public.dh_meetup_crews from anon, authenticated;
grant update (name, vote_deadline, route_locked_at) on public.dh_nights to authenticated;
grant update (display_name, color) on public.dh_members to authenticated;
grant update (title, description, practical, updated_at) on public.dh_routes to authenticated;
grant update (pos, arrival, duration, reason, practical, transfer, fixed) on public.dh_stops to authenticated;
grant update (reaction, note, updated_at) on public.dh_reactions to authenticated;
grant update (route_id) on public.dh_idea_votes to authenticated;
grant update (name, color) on public.dh_crews to authenticated;
grant update (at, event_id, note) on public.dh_meetups to authenticated;
grant update (confirmed_at, arrived_at) on public.dh_meetup_crews to authenticated;

-- ===== from MuseumHop 20261103090000_personal_links.sql =====
-- Personal links: a private link that opens your nights as you on any device, without an account.
--
-- Everyone starts as an anonymous sign-in that exists in one browser only. Asking for a personal link turns that
-- sign-in into a permanent one with a generated address (m-<uid>@users.docuhop.arian-shafa.xyz, which receives
-- no mail) and a random 256-bit secret as its password, stored only as a bcrypt hash. The link carries the uid and
-- the secret; another device signs in with them and becomes the same user, so every row already keyed on that uid
-- (membership, reactions, routes, votes) comes along and no data moves. Asking again replaces the secret, which
-- turns the previous link off; devices already signed in stay signed in.

create function public.dh_personal_link()
returns text language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  v_secret text := encode(gen_random_bytes(32), 'hex');
  v_email text := 'm-' || auth.uid() || '@users.docuhop.arian-shafa.xyz';
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from dh_members where user_id = v_uid and not fictional) then
    raise exception 'Create or join a night first.';
  end if;
  update auth.users set
    email = v_email,
    encrypted_password = crypt(v_secret, gen_salt('bf', 10)),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    is_anonymous = false,
    updated_at = now()
  where id = v_uid and coalesce(email, '') in ('', v_email);
  if not found then raise exception 'This account already has another sign-in method.'; end if;
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_uid::text, v_uid, jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now())
    on conflict do nothing;
  return v_secret;
end $$;

-- The night an invite token opens, but only for someone who is already in it: lets a device that knows who you are
-- (a personal link, or a browser that lost its list of nights) open your night without joining it again.
create function public.dh_member_night(p_token text)
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select i.night_id from dh_invites i
  join dh_members m on m.night_id = i.night_id and m.user_id = auth.uid()
  where i.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and i.revoked_at is null
  limit 1
$$;

revoke execute on function public.dh_personal_link() from public, anon;
revoke execute on function public.dh_member_night(text) from public, anon;
grant execute on function public.dh_personal_link() to authenticated;
grant execute on function public.dh_member_night(text) to authenticated;


-- ===== from MuseumHop 20261104090000_maybe_and_view_links.sql =====
-- Maybe stops, and view-only links.
--
-- Maybe: a stop can be marked "maybe" (a detour if there's time). It stays in the route; the app draws it greyed and
-- dotted. Existing stops are all "sure".
alter table public.dh_stops add column maybe boolean not null default false;
grant update (maybe) on public.dh_stops to authenticated; -- stop columns are granted one by one

-- View-only links: one per night. Whoever opens it sees the night's routes (stop, time, place; crews optional) and
-- nothing else: no names, votes or notes, and no way to change anything. The person doesn't join the night; the page
-- reads the routes through dh_view_night, so their visit leaves no trace in the group. The token is kept as is (not
-- hashed) so every member can copy the same link; only members can read it (dh_view_link), and it only ever reads.
create table public.dh_view_links (
  night_id uuid primary key references public.dh_nights (id) on delete cascade,
  token text not null unique,
  crews boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.dh_view_links enable row level security;
revoke all on public.dh_view_links from anon, authenticated;

-- The night's view-only link (made on first use). p_new replaces it, which turns the old one off. Planners and
-- organisers only; returns null for anyone else.
create function public.dh_view_link(p_night uuid, p_crews boolean default null, p_new boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v public.dh_view_links;
begin
  if not public.dh_can_write(p_night) then return null; end if;
  if p_new then delete from public.dh_view_links where night_id = p_night; end if;
  insert into public.dh_view_links (night_id, token, crews, created_by)
    values (p_night, encode(gen_random_bytes(24), 'hex'), coalesce(p_crews, true), auth.uid())
    on conflict (night_id) do update set crews = coalesce(p_crews, dh_view_links.crews)
    returning * into v;
  return jsonb_build_object('token', v.token, 'crews', v.crews);
end $$;

-- Turns the view-only link off.
create function public.dh_view_link_off(p_night uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.dh_view_links where night_id = p_night and public.dh_can_write(p_night);
$$;

-- What a view-only link shows: routes and their stops only. Callable signed out.
create function public.dh_view_night(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', n.name, 'event_date', n.event_date,
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', r.kind,
        'title', case when r.kind = 'shared' then 'Our route' else coalesce(c.name, 'Crew') || '’s route' end,
        'color', coalesce(c.color, '#df664f'),
        'stops', coalesce((select jsonb_agg(jsonb_build_object('event_id', s.event_id, 'arrival', s.arrival, 'duration', s.duration, 'maybe', s.maybe, 'fixed', s.fixed) order by s.pos)
                           from public.dh_stops s where s.route_id = r.id), '[]'::jsonb))
        order by r.kind desc, c.name)
      from public.dh_routes r left join public.dh_crews c on c.id = r.crew_id
      where r.night_id = n.id and (r.kind = 'shared' or (r.kind = 'crew' and v.crews))), '[]'::jsonb))
  from public.dh_view_links v join public.dh_nights n on n.id = v.night_id
  where v.token = p_token
$$;

revoke execute on function public.dh_view_link(uuid, boolean, boolean) from public, anon;
revoke execute on function public.dh_view_link_off(uuid) from public, anon;
revoke execute on function public.dh_view_night(text) from public;
grant execute on function public.dh_view_link(uuid, boolean, boolean) to authenticated;
grant execute on function public.dh_view_link_off(uuid) to authenticated;
grant execute on function public.dh_view_night(text) to anon, authenticated;

-- ===== from MuseumHop 20261104150000_travel_and_stay.sql =====
-- How a route gets around (walk, bike or car) and how long a stop lasts by default. Both live on the route, so on the
-- shared route the whole group sees the same timeline. A stop can override the mode for the leg that leads to it.
alter table public.dh_routes
  add column travel text not null default 'foot' check (travel in ('foot', 'bike', 'car')),
  add column stay int not null default 45 check (stay between 10 and 180);
alter table public.dh_stops add column travel text check (travel in ('foot', 'bike', 'car'));
grant update (travel, stay) on public.dh_routes to authenticated;
grant update (travel) on public.dh_stops to authenticated; -- stop columns are granted one by one

-- ===== new for DocuHop =====

-- The group ticket board: each member's own status per showing. DocuHop never sells tickets or touches MyIDFA;
-- people buy on IDFA's site and tick "got it" themselves.
create table public.dh_tickets (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  event_id text not null check (event_id ~ '^[a-z0-9:_-]{1,160}$'),
  status text not null check (status in ('got', 'want', 'skip')),
  updated_at timestamptz not null default now(),
  unique (night_id, user_id, event_id)
);

-- "When is everyone free?": one row per festival day (0 = Thu 12 Nov … 10 = Sun 22 Nov) a member says they're free.
create table public.dh_free (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.dh_nights(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  day int not null check (day between 0 and 10),
  unique (night_id, user_id, day)
);

alter table public.dh_tickets enable row level security;
alter table public.dh_free enable row level security;

create policy "members read tickets" on public.dh_tickets for select using (public.dh_role(night_id) is not null);
create policy "add own ticket status" on public.dh_tickets for insert
  with check (user_id = auth.uid() and public.dh_can_write(night_id));
create policy "edit own ticket status" on public.dh_tickets for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.dh_can_write(night_id));
create policy "remove own ticket status" on public.dh_tickets for delete using (user_id = auth.uid());

create policy "members read free days" on public.dh_free for select using (public.dh_role(night_id) is not null);
create policy "add own free day" on public.dh_free for insert
  with check (user_id = auth.uid() and public.dh_can_write(night_id));
create policy "remove own free day" on public.dh_free for delete using (user_id = auth.uid());

revoke update on public.dh_tickets, public.dh_free from anon, authenticated;
grant update (status, updated_at) on public.dh_tickets to authenticated;
grant update (day) on public.dh_meetups to authenticated;

create trigger dh_tickets_log after insert or update or delete on public.dh_tickets for each row execute function public.dh_log();

alter publication supabase_realtime add table public.dh_tickets, public.dh_free;

-- Retention, as the "Your data" page says: 30 days after the festival's last day (Sun 22 Nov 2026), every group and
-- everything in it goes (cascade), on 23 Dec 2026. Personal-link sign-ins left without a group go too, and anonymous
-- DocuHop sign-ins (tagged app=docuhop) that never joined a group are removed after a day. Auth is shared with other
-- apps in this project, so only DocuHop's own sign-ins are ever touched.
select cron.schedule('docuhop-retention', '23 3 * * *', $job$
  delete from public.dh_nights where event_date < current_date - 30;
  delete from auth.users u
    where u.email like 'm-%@users.docuhop.arian-shafa.xyz'
      and not exists (select 1 from public.dh_members m where m.user_id = u.id);
  delete from auth.users u
    where u.is_anonymous and u.raw_user_meta_data ->> 'app' = 'docuhop'
      and u.created_at < now() - interval '1 day'
      and not exists (select 1 from public.dh_members m where m.user_id = u.id);
$job$);
