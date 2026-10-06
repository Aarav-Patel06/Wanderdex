import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CATEGORIES, CATEGORY_LABELS, categoryFromGoogle, categorySprite } from "@/lib/categories";

describe("categoryFromGoogle", () => {
  // Every type in SPEC §12.5, as the primaryType.
  it.each([
    ["food", "restaurant"],
    ["food", "fast_food_restaurant"],
    ["food", "food_court"],
    ["food", "meal_takeaway"],
    ["food", "meal_delivery"],
    ["food", "bakery"],
    ["food", "deli"],
    ["food", "diner"],
    ["food", "sandwich_shop"],
    ["cafe", "cafe"],
    ["cafe", "coffee_shop"],
    ["cafe", "tea_house"],
    ["cafe", "cat_cafe"],
    ["cafe", "dog_cafe"],
    ["cafe", "dessert_shop"],
    ["cafe", "ice_cream_shop"],
    ["cafe", "juice_shop"],
    ["bar", "bar"],
    ["bar", "pub"],
    ["bar", "wine_bar"],
    ["bar", "bar_and_grill"],
    ["bar", "brewery"],
    ["museum", "museum"],
    ["museum", "art_gallery"],
    ["museum", "planetarium"],
    ["landmark", "tourist_attraction"],
    ["landmark", "historical_landmark"],
    ["landmark", "monument"],
    ["landmark", "cultural_landmark"],
    ["landmark", "historical_place"],
    ["landmark", "church"],
    ["landmark", "mosque"],
    ["landmark", "hindu_temple"],
    ["landmark", "synagogue"],
    ["landmark", "place_of_worship"],
    ["landmark", "observation_deck"],
    ["park_nature", "park"],
    ["park_nature", "national_park"],
    ["park_nature", "state_park"],
    ["park_nature", "hiking_area"],
    ["park_nature", "beach"],
    ["park_nature", "garden"],
    ["park_nature", "botanical_garden"],
    ["park_nature", "campground"],
    ["park_nature", "lake"],
    ["park_nature", "mountain_peak"],
    ["park_nature", "playground"],
    ["park_nature", "fishing_charter"],
    ["park_nature", "fishing_pier"],
    ["park_nature", "fishing_pond"],
    ["shopping", "shopping_mall"],
    ["shopping", "market"],
    ["shopping", "supermarket"],
    ["shopping", "store"],
    ["stay", "lodging"],
    ["stay", "hotel"],
    ["stay", "hostel"],
    ["stay", "motel"],
    ["stay", "resort_hotel"],
    ["stay", "bed_and_breakfast"],
    ["stay", "guest_house"],
    ["stay", "inn"],
    ["entertainment", "movie_theater"],
    ["entertainment", "amusement_park"],
    ["entertainment", "night_club"],
    ["entertainment", "bowling_alley"],
    ["entertainment", "concert_hall"],
    ["entertainment", "performing_arts_theater"],
    ["entertainment", "stadium"],
    ["entertainment", "arena"],
    ["entertainment", "race_course"],
    ["entertainment", "zoo"],
    ["entertainment", "aquarium"],
    ["entertainment", "casino"],
    ["entertainment", "karaoke"],
    ["entertainment", "video_arcade"],
    ["sports", "gym"],
    ["sports", "fitness_center"],
    ["sports", "yoga_studio"],
    ["sports", "sports_club"],
    ["sports", "sports_complex"],
    ["sports", "sports_coaching"],
    ["sports", "sports_school"],
    ["sports", "sports_activity_location"],
    ["sports", "athletic_field"],
    ["sports", "swimming_pool"],
    ["sports", "tennis_court"],
    ["sports", "golf_course"],
    ["sports", "indoor_golf_course"],
    ["sports", "ski_resort"],
    ["sports", "ice_skating_rink"],
    ["sports", "skateboard_park"],
    ["sports", "cycling_park"],
    ["campus", "university"],
    ["campus", "school"],
    ["campus", "primary_school"],
    ["campus", "secondary_school"],
    ["campus", "preschool"],
    ["campus", "library"],
    ["campus", "academic_department"],
    ["campus", "educational_institution"],
    ["campus", "research_institute"],
    ["campus", "school_district"],
    ["airport", "airport"],
    ["airport", "international_airport"],
    ["airport", "airstrip"],
    ["airport", "heliport"],
    ["city", "locality"],
    ["city", "sublocality"],
    ["city", "sublocality_level_1"],
    ["city", "sublocality_level_2"],
    ["city", "sublocality_level_3"],
    ["city", "sublocality_level_4"],
    ["city", "sublocality_level_5"],
    ["city", "neighborhood"],
    ["city", "postal_town"],
    ["city", "administrative_area_level_1"],
    ["city", "administrative_area_level_2"],
    ["city", "administrative_area_level_3"],
    ["city", "administrative_area_level_4"],
    ["city", "administrative_area_level_5"],
    ["city", "administrative_area_level_6"],
    ["city", "administrative_area_level_7"],
    ["city", "colloquial_area"],
  ])("%s ← %s", (category, type) => {
    expect(categoryFromGoogle(type, [])).toBe(category);
  });

  it.each(["italian_restaurant", "ramen_restaurant", "brunch_restaurant"])(
    "*_restaurant → food (%s)",
    (type) => expect(categoryFromGoogle(type)).toBe("food"),
  );

  it.each(["book_store", "clothing_store", "convenience_store", "grocery_store"])(
    "*_store → shopping (%s)",
    (type) => expect(categoryFromGoogle(type)).toBe("shopping"),
  );

  it("prefers an exact match to a suffix rule", () => {
    expect(categoryFromGoogle("bar_and_grill")).toBe("bar");
  });

  it("needs the underscore for a suffix rule", () => {
    expect(categoryFromGoogle("superstore")).toBe("other");
  });

  it("keeps venues for watching sport in Entertainment, and playgrounds in Park & Nature", () => {
    expect(categoryFromGoogle("stadium", ["sports_complex", "athletic_field"])).toBe("entertainment");
    expect(categoryFromGoogle("arena", ["sports_activity_location"])).toBe("entertainment");
    expect(categoryFromGoogle("playground", ["sports_activity_location"])).toBe("park_nature");
  });

  it("now sorts an airport that used to fall through to its types", () => {
    expect(categoryFromGoogle("airport", ["point_of_interest", "tourist_attraction"])).toBe("airport");
  });

  it("leaves a country as other", () => {
    expect(categoryFromGoogle("country", ["political"])).toBe("other");
  });

  it.each(["spa", "sauna", "massage", "massage_spa", "wellness_center"])("leaves %s as other", (type) => {
    expect(categoryFromGoogle(type, [])).toBe("other");
  });

  it("checks primaryType before types", () => {
    expect(categoryFromGoogle("cafe", ["restaurant", "food"])).toBe("cafe");
    expect(categoryFromGoogle("museum", ["tourist_attraction"])).toBe("museum");
  });

  it("falls through an unmapped primaryType to types, in order", () => {
    expect(categoryFromGoogle("train_station", ["point_of_interest", "tourist_attraction", "restaurant"])).toBe(
      "landmark",
    );
    expect(categoryFromGoogle("point_of_interest", ["bakery", "cafe"])).toBe("food");
  });

  it("uses types when there's no primaryType", () => {
    expect(categoryFromGoogle(null, ["establishment", "park"])).toBe("park_nature");
    expect(categoryFromGoogle(undefined, ["hotel"])).toBe("stay");
    expect(categoryFromGoogle(null, ["political", "locality"])).toBe("city");
  });

  it.each([
    ["an unmapped type", "train_station", ["point_of_interest", "establishment"]],
    ["nothing at all", null, []],
    ["an empty primaryType", "", []],
  ] as const)("falls back to other for %s", (_, primaryType, types) => {
    expect(categoryFromGoogle(primaryType, types)).toBe("other");
  });
});

describe("labels and sprites", () => {
  it("labels every category per SPEC §12.5", () => {
    expect(CATEGORIES.map((c) => CATEGORY_LABELS[c])).toEqual([
      "Food",
      "Cafe",
      "Bar",
      "Museum",
      "Landmark",
      "Park & Nature",
      "Shopping",
      "Stay",
      "Entertainment",
      "Sports",
      "Campus",
      "Airport",
      "City",
      "Other",
    ]);
  });

  it("points every category at a sprite that exists", () => {
    expect(categorySprite("park_nature")).toBe("/sprites/pin_park_nature.png");
    for (const category of CATEGORIES) {
      expect(existsSync(join(process.cwd(), "public", categorySprite(category)))).toBe(true);
    }
  });
});
