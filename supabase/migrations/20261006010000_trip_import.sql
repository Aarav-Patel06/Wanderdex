-- Wanderdex Phase 4.2: Trip Photos lookups and saving (SPEC §8, §9, §11.8, §17).
-- One migration: the shared Nearby Search cache, the per-import counts, and the visits
-- columns that make an import's saves idempotent.

-- Idempotent import saves (SPEC §11.8 step 8): a Trip Photos visit carries its import's id
-- and its stop's number. Both are set, or neither is.
alter table visits
  add column import_id   uuid,
  add column import_stop smallint,
  add constraint visits_import_stop_check check (
    (import_id is null and import_stop is null)
    or (import_id is not null and import_stop >= 1)
  );

-- One visit per import stop: backs up the server's look-before-insert when two saves race.
create unique index visits_import_stop_idx on visits (user_id, import_id, import_stop)
  where import_id is not null;

-- Shared Nearby Search cache (SPEC §17): one row per rounded location cell, shared by all
-- users. No user id: it records places, not who looked.
create table nearby_cache (
  cell       text primary key,                -- rounded 'lat,lng' of the looked-up point
  candidates jsonb not null,                  -- up to 3 results; [] = none within 150 m
  fetched_at timestamptz not null default now()
);
create index nearby_cache_fetched_idx on nearby_cache (fetched_at);

-- One row per Trip Photos import's lookups (SPEC §11.8 step 5): counts only, no locations.
create table import_log (
  id               bigint generated always as identity primary key,
  import_id        uuid not null unique,      -- also on the import's visits
  -- Set null when the user is deleted, so their import counts stay for analysis.
  user_id          uuid references auth.users(id) on delete set null,
  stops            int not null,
  local_matches    int not null,              -- stops answered by the user's own places
  shared           int not null,              -- stops answered by another stop's lookup
  cache_hits       int not null,              -- lookups answered by nearby_cache
  google_lookups   int not null,              -- lookups sent to Google
  google_calls     int not null,              -- Google calls made (a 150 m retry counts twice)
  unmatched_limit  int not null,              -- stops left unmatched by the allowance or a cap
  created_at       timestamptz not null default now()
);

-- Server only, like resolve_log and google_call_log: RLS on with no policies, and no
-- privileges for the browser roles (Supabase's default privileges would otherwise give them
-- everything).
alter table nearby_cache enable row level security;
alter table import_log   enable row level security;
revoke all on nearby_cache, import_log from anon, authenticated;
grant all on nearby_cache, import_log to service_role;
