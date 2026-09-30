-- Wanderdex initial schema (SPEC §8) and Row Level Security (SPEC §9).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

-- Categories (fixed list)
create type place_category as enum (
  'food','cafe','bar','museum','landmark',
  'park_nature','shopping','stay','entertainment','other'
);

create type date_precision as enum ('datetime','date','month');

create type visit_source as enum ('link','text','photo','manual');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per user
create table profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique
             check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

-- One row per real-world place
create table places (
  id                  uuid primary key default gen_random_uuid(),
  google_place_id     text unique,              -- null for manual places
  name                text not null,
  category            place_category not null default 'other', -- auto-detected default
  google_primary_type text,
  address             text,
  city                text,
  country             text,
  country_code        char(2),                  -- ISO 3166-1 alpha-2, uppercase
  lat                 double precision not null,
  lng                 double precision not null,
  timezone            text,                     -- IANA, from coordinates
  created_by          uuid references auth.users(id) on delete set null, -- set for manual places
  created_at          timestamptz not null default now()
);

-- One row per visit
create table visits (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  place_id          uuid not null references places(id) on delete restrict,
  category          place_category not null,   -- the user's category (see note)
  visited_at        timestamptz not null,      -- UTC instant
  visited_precision date_precision not null default 'datetime',
  timezone          text not null,             -- IANA zone used to display visited_at
  rating            smallint check (rating between 1 and 10),
  note              text check (char_length(note) <= 2000),
  source            visit_source not null,
  source_input      text,                      -- original link or typed text (never photo data)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index visits_user_visited_idx on visits (user_id, visited_at desc);
create index visits_user_place_idx   on visits (user_id, place_id);

-- For per-user rate limiting of lookups
create table resolve_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                  -- 'link' | 'text' | 'nearby'
  created_at timestamptz not null default now()
);
create index resolve_log_user_time_idx on resolve_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- visits.updated_at trigger
-- ---------------------------------------------------------------------------

create function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger visits_set_updated_at
  before update on visits
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges. RLS below decides which rows; these decide which operations.
-- Granted explicitly so the schema doesn't depend on the project's default grants.
-- ---------------------------------------------------------------------------

grant select, update                 on profiles    to authenticated;
grant select                         on places      to authenticated;
grant select, insert, update, delete on visits      to authenticated;
grant all                            on profiles, places, visits, resolve_log to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security (SPEC §9)
-- ---------------------------------------------------------------------------

alter table profiles    enable row level security;
alter table places      enable row level security;
alter table visits      enable row level security;
alter table resolve_log enable row level security;

-- profiles: read and update only your own row. No insert policy: the server
-- creates profiles with the secret key after checking the username.
create policy "profiles: select own" on profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles: update own" on profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- places: Google places are shared; manual places are private to their creator.
-- No insert/update policies: the server writes places with the secret key.
create policy "places: select google or own manual" on places
  for select to authenticated
  using (google_place_id is not null or created_by = (select auth.uid()));

-- visits: full access to your own rows only.
create policy "visits: select own" on visits
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "visits: insert own" on visits
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "visits: update own" on visits
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "visits: delete own" on visits
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- resolve_log: RLS on with no policies = no browser access. Server only.
