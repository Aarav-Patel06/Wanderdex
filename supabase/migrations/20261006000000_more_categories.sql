-- Wanderdex: four more categories (SPEC §8, §12.5). Order: ... entertainment, sports, campus,
-- airport, city, other, the same as src/lib/categories.ts.
-- New enum values can't be used in the transaction that adds them, so the backfill of existing
-- places and visits is a separate script, run after this one.

alter type place_category add value if not exists 'sports' before 'other';
alter type place_category add value if not exists 'campus' before 'other';
alter type place_category add value if not exists 'airport' before 'other';
alter type place_category add value if not exists 'city' before 'other';
