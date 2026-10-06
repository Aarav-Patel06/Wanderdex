-- Wanderdex: re-sort existing places under the 14 categories (SPEC §12.5, 2026-10-06).
-- Needs 20261006000000_more_categories.sql applied first. Run by hand in the SQL Editor:
--
--   1. Highlight PART A only and run it ("Run selected"). Check the list.
--   2. Then highlight PART B only and run it. It's a single statement: all or nothing.
--
-- Don't run the whole file at once: that runs PART B straight after PART A.
--
-- places only keeps google_primary_type (not types), so a place is re-sorted only when its
-- primary type is one of the newly mapped types; the new rules check primaryType first, so
-- that type alone decides its new category. A user's visits at a place change only when every
-- one of them still has the place's old auto-detected category (the user never changed it),
-- so each user keeps one category per place (SPEC §8). Changed visits get a new updated_at
-- from the trigger.


-- ===================== PART A: preview (changes nothing) =====================
-- One row per changed place and user with visits there (users blank: nobody has visited it).

with
  new_rules (primary_type, category) as (
    -- Every Google type the 2026-10-06 rules newly map (all fell through to types, or to
    -- Other, before). Types mapped before keep their category, so only these can change.
    values
    ('arena', 'entertainment'),
    ('race_course', 'entertainment'),
    ('playground', 'park_nature'),
    ('fishing_charter', 'park_nature'),
    ('fishing_pier', 'park_nature'),
    ('fishing_pond', 'park_nature'),
    ('gym', 'sports'),
    ('fitness_center', 'sports'),
    ('yoga_studio', 'sports'),
    ('sports_club', 'sports'),
    ('sports_complex', 'sports'),
    ('sports_coaching', 'sports'),
    ('sports_school', 'sports'),
    ('sports_activity_location', 'sports'),
    ('athletic_field', 'sports'),
    ('swimming_pool', 'sports'),
    ('tennis_court', 'sports'),
    ('golf_course', 'sports'),
    ('indoor_golf_course', 'sports'),
    ('ski_resort', 'sports'),
    ('ice_skating_rink', 'sports'),
    ('skateboard_park', 'sports'),
    ('cycling_park', 'sports'),
    ('university', 'campus'),
    ('school', 'campus'),
    ('primary_school', 'campus'),
    ('secondary_school', 'campus'),
    ('preschool', 'campus'),
    ('library', 'campus'),
    ('academic_department', 'campus'),
    ('educational_institution', 'campus'),
    ('research_institute', 'campus'),
    ('school_district', 'campus'),
    ('airport', 'airport'),
    ('international_airport', 'airport'),
    ('airstrip', 'airport'),
    ('heliport', 'airport'),
    ('locality', 'city'),
    ('sublocality', 'city'),
    ('sublocality_level_1', 'city'),
    ('sublocality_level_2', 'city'),
    ('sublocality_level_3', 'city'),
    ('sublocality_level_4', 'city'),
    ('sublocality_level_5', 'city'),
    ('neighborhood', 'city'),
    ('postal_town', 'city'),
    ('administrative_area_level_1', 'city'),
    ('administrative_area_level_2', 'city'),
    ('administrative_area_level_3', 'city'),
    ('administrative_area_level_4', 'city'),
    ('administrative_area_level_5', 'city'),
    ('administrative_area_level_6', 'city'),
    ('administrative_area_level_7', 'city'),
    ('colloquial_area', 'city')
  ),
  changed as (
    -- Google places whose primary type now decides a different category. Manual places
    -- (no google_place_id) are left alone.
    select p.id, p.name, p.google_primary_type, p.category as old_category,
           r.category::place_category as new_category
    from places p
    join new_rules r on r.primary_type = p.google_primary_type
    where p.google_place_id is not null
      and p.category <> r.category::place_category
  ),
  by_user as (
    select v.place_id, v.user_id, count(*) as visits,
           string_agg(distinct v.category::text, ', ') as user_category,
           bool_and(v.category = c.old_category) as unchanged_by_user
    from visits v
    join changed c on c.id = v.place_id
    group by v.place_id, v.user_id
  )
select c.name, c.google_primary_type, c.old_category, c.new_category,
       pr.username, u.visits, u.user_category,
       case when u.user_id is null then null
            when u.unchanged_by_user then 'yes → ' || c.new_category
            else 'no (user chose ' || u.user_category || ')' end as visits_change
from changed c
left join by_user u on u.place_id = c.id
left join profiles pr on pr.user_id = u.user_id
order by c.new_category, c.name, pr.username;


-- ===================== PART B: update (one statement) =====================
-- Every sub-statement sees the data as it was before the statement, so the visits are
-- matched against the places' old categories. Shows how many rows changed.

with
  new_rules (primary_type, category) as (
    -- Every Google type the 2026-10-06 rules newly map (all fell through to types, or to
    -- Other, before). Types mapped before keep their category, so only these can change.
    values
    ('arena', 'entertainment'),
    ('race_course', 'entertainment'),
    ('playground', 'park_nature'),
    ('fishing_charter', 'park_nature'),
    ('fishing_pier', 'park_nature'),
    ('fishing_pond', 'park_nature'),
    ('gym', 'sports'),
    ('fitness_center', 'sports'),
    ('yoga_studio', 'sports'),
    ('sports_club', 'sports'),
    ('sports_complex', 'sports'),
    ('sports_coaching', 'sports'),
    ('sports_school', 'sports'),
    ('sports_activity_location', 'sports'),
    ('athletic_field', 'sports'),
    ('swimming_pool', 'sports'),
    ('tennis_court', 'sports'),
    ('golf_course', 'sports'),
    ('indoor_golf_course', 'sports'),
    ('ski_resort', 'sports'),
    ('ice_skating_rink', 'sports'),
    ('skateboard_park', 'sports'),
    ('cycling_park', 'sports'),
    ('university', 'campus'),
    ('school', 'campus'),
    ('primary_school', 'campus'),
    ('secondary_school', 'campus'),
    ('preschool', 'campus'),
    ('library', 'campus'),
    ('academic_department', 'campus'),
    ('educational_institution', 'campus'),
    ('research_institute', 'campus'),
    ('school_district', 'campus'),
    ('airport', 'airport'),
    ('international_airport', 'airport'),
    ('airstrip', 'airport'),
    ('heliport', 'airport'),
    ('locality', 'city'),
    ('sublocality', 'city'),
    ('sublocality_level_1', 'city'),
    ('sublocality_level_2', 'city'),
    ('sublocality_level_3', 'city'),
    ('sublocality_level_4', 'city'),
    ('sublocality_level_5', 'city'),
    ('neighborhood', 'city'),
    ('postal_town', 'city'),
    ('administrative_area_level_1', 'city'),
    ('administrative_area_level_2', 'city'),
    ('administrative_area_level_3', 'city'),
    ('administrative_area_level_4', 'city'),
    ('administrative_area_level_5', 'city'),
    ('administrative_area_level_6', 'city'),
    ('administrative_area_level_7', 'city'),
    ('colloquial_area', 'city')
  ),
  changed as (
    -- Google places whose primary type now decides a different category. Manual places
    -- (no google_place_id) are left alone.
    select p.id, p.name, p.google_primary_type, p.category as old_category,
           r.category::place_category as new_category
    from places p
    join new_rules r on r.primary_type = p.google_primary_type
    where p.google_place_id is not null
      and p.category <> r.category::place_category
  ),
  untouched as (
    -- (user, place) pairs where every visit still has the old auto-detected category.
    select v.user_id, v.place_id
    from visits v
    join changed c on c.id = v.place_id
    group by v.user_id, v.place_id
    having bool_and(v.category = c.old_category)
  ),
  updated_visits as (
    update visits v
    set category = c.new_category
    from changed c, untouched t
    where v.place_id = c.id and t.place_id = v.place_id and t.user_id = v.user_id
    returning v.id
  ),
  updated_places as (
    update places p
    set category = c.new_category
    from changed c
    where p.id = c.id
    returning p.id
  )
select (select count(*) from updated_places) as places_updated,
       (select count(*) from updated_visits) as visits_updated;
