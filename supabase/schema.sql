create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Still user',
  timezone text not null default 'UTC',
  avatar_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.meditation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null check(duration_seconds>0),
  completed boolean not null default true,
  sound_ids text[] not null default '{}',
  mood_before text,
  mood_after text,
  rating smallint check(rating between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.journal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid unique references public.meditation_sessions(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  icon text not null default '🌿',
  color text not null default '#6f8b75',
  schedule_days smallint[] not null default '{0,1,2,3,4,5,6}',
  target_value numeric,
  target_unit text,
  reminder_time time,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.habit_entries (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  value numeric not null default 1,
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  unique(habit_id,local_date)
);

create table if not exists public.sound_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  sound_ids text[] not null check(cardinality(sound_ids)<=3),
  volumes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  invite_code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  status text not null default 'pending' check(status in('pending','accepted','blocked','removed')),
  requester_privacy jsonb not null default '{"streak":true,"today":true,"weekly":true,"shared_habits":false}',
  addressee_privacy jsonb not null default '{"streak":true,"today":true,"weekly":true,"shared_habits":false}',
  created_at timestamptz not null default now(),
  check(requester_id<>addressee_id)
);

create table if not exists public.shared_habits (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_consented boolean not null default false,
  partner_consented boolean not null default false,
  unique(connection_id,habit_id)
);

create table if not exists public.shared_challenges (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  title text not null,
  challenge_type text not null,
  target integer not null check(target>0),
  starts_on date not null,
  ends_on date,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check(reaction in('leaf','heart','clap','keep_going')),
  local_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  habit_id uuid references public.habits(id) on delete cascade,
  kind text not null check(kind in('meditation','habit')),
  local_time time not null,
  days smallint[] not null default '{0,1,2,3,4,5,6}',
  enabled boolean not null default true
);

create table if not exists public.moods (
  key text primary key,
  label text not null,
  sort_order smallint not null
);

alter table public.profiles enable row level security;
alter table public.meditation_sessions enable row level security;
alter table public.journal_notes enable row level security;
alter table public.habits enable row level security;
alter table public.habit_entries enable row level security;
alter table public.sound_presets enable row level security;
alter table public.connections enable row level security;
alter table public.shared_habits enable row level security;
alter table public.shared_challenges enable row level security;
alter table public.reactions enable row level security;
alter table public.reminders enable row level security;
alter table public.moods enable row level security;

create policy "profiles self read" on public.profiles for select using(auth.uid()=id);
create policy "profiles self update" on public.profiles for update using(auth.uid()=id) with check(auth.uid()=id);
create policy "sessions owner" on public.meditation_sessions for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "notes owner" on public.journal_notes for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "habits owner" on public.habits for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "entries owner" on public.habit_entries for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "presets owner" on public.sound_presets for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "reminders owner" on public.reminders for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "moods read" on public.moods for select using(true);

create policy "connections members read" on public.connections for select using(auth.uid() in(requester_id,addressee_id));
create policy "connections requester create" on public.connections for insert with check(auth.uid()=requester_id);
create policy "connections members update" on public.connections for update using(auth.uid() in(requester_id,addressee_id));
create policy "connections members delete" on public.connections for delete using(auth.uid() in(requester_id,addressee_id));

create policy "shared habits members read" on public.shared_habits for select using(
  exists(select 1 from public.connections c where c.id=connection_id and auth.uid() in(c.requester_id,c.addressee_id))
);
create policy "shared habits owner write" on public.shared_habits for all using(auth.uid()=owner_id) with check(auth.uid()=owner_id);

create policy "challenge members read" on public.shared_challenges for select using(
  exists(select 1 from public.connections c where c.id=connection_id and auth.uid() in(c.requester_id,c.addressee_id))
);
create policy "challenge members create" on public.shared_challenges for insert with check(
  auth.uid()=created_by and exists(select 1 from public.connections c where c.id=connection_id and c.status='accepted' and auth.uid() in(c.requester_id,c.addressee_id))
);
create policy "reaction members read" on public.reactions for select using(auth.uid() in(sender_id,receiver_id));
create policy "reaction sender create" on public.reactions for insert with check(auth.uid()=sender_id);

-- Privacy-safe partner stats function: never returns email, journal text, precise timestamps, or unrelated habits.
create or replace function public.partner_progress(p_connection uuid,p_partner uuid)
returns table(current_streak int,completed_today boolean,weekly_minutes int)
language plpgsql security definer set search_path=public as $$
declare viewer uuid:=auth.uid(); allowed boolean; tz text; privacy jsonb;
begin
  select exists(select 1 from connections c where c.id=p_connection and c.status='accepted' and viewer in(c.requester_id,c.addressee_id) and p_partner in(c.requester_id,c.addressee_id)) into allowed;
  if not allowed then raise exception 'not authorized'; end if;
  select timezone into tz from profiles where id=p_partner;
  select case when requester_id=p_partner then requester_privacy else addressee_privacy end into privacy from connections where id=p_connection;
  return query
  with days as(
    select (ended_at at time zone tz)::date d,sum(duration_seconds)/60 mins
    from meditation_sessions where user_id=p_partner and completed=true group by 1
  )
  select
    case when coalesce((privacy->>'streak')::boolean,false) then (
      select count(*)::int from generate_series(0,365) g(n)
      where exists(select 1 from days where d=((now() at time zone tz)::date-g.n))
        and not exists(select 1 from generate_series(0,g.n-1) p(n) where not exists(select 1 from days where d=((now() at time zone tz)::date-p.n)))
    ) else null end,
    case when coalesce((privacy->>'today')::boolean,false) then exists(select 1 from days where d=(now() at time zone tz)::date) else null end,
    case when coalesce((privacy->>'weekly')::boolean,false) then coalesce((select sum(mins)::int from days where d>=(now() at time zone tz)::date-6),0) else null end;
end $$;
