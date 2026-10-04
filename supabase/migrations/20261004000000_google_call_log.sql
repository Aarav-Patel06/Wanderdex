-- Global monthly cap per Google SKU (SPEC §17). One row per Google Places call, across all
-- users, so the server can count this calendar month's calls for each SKU. resolve_log counts
-- lookups per user, not Google calls (a Nearby retry is one lookup but two calls).

create table google_call_log (
  id         bigint generated always as identity primary key,
  sku        text not null check (sku in ('text_search', 'nearby_search')),
  -- Who caused it. Set null when the user is deleted, so their calls still count this month.
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index google_call_log_sku_time_idx on google_call_log (sku, created_at);

-- Server only, like resolve_log: RLS on with no policies, and no privileges for the browser
-- roles (Supabase's default privileges would otherwise give them everything).
alter table google_call_log enable row level security;
revoke all on google_call_log from anon, authenticated;
grant all on google_call_log to service_role;
