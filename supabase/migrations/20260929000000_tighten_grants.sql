-- Tighten table privileges (SPEC §9). Supabase's default privileges give anon and
-- authenticated every privilege on new public tables, so the grants in the init
-- migration only added to them. Revoke everything, then grant back only what the
-- browser needs. RLS still decides which rows.

revoke all on profiles, places, visits, resolve_log from anon;
revoke all on profiles, places, visits, resolve_log from authenticated;

grant select                         on profiles to authenticated;
grant select                         on places   to authenticated;
grant select, insert, update, delete on visits   to authenticated;

-- No username editing, and changing a username would break login (it maps to the
-- auth email). All profile writes happen on the server with the secret key.
drop policy "profiles: update own" on profiles;
