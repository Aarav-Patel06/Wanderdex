// The fixed categories (SPEC §12.5). Same values and order as the place_category enum.
export const CATEGORIES = [
  "food",
  "cafe",
  "bar",
  "museum",
  "landmark",
  "park_nature",
  "shopping",
  "stay",
  "entertainment",
  "sports",
  "campus",
  "airport",
  "city",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  food: "Food",
  cafe: "Cafe",
  bar: "Bar",
  museum: "Museum",
  landmark: "Landmark",
  park_nature: "Park & Nature",
  shopping: "Shopping",
  stay: "Stay",
  entertainment: "Entertainment",
  sports: "Sports",
  campus: "Campus",
  airport: "Airport",
  city: "City",
  other: "Other",
};

export function categorySprite(category: Category) {
  return `/sprites/pin_${category}.png`;
}

const GOOGLE_TYPES: Record<Exclude<Category, "other">, string[]> = {
  food: [
    "restaurant",
    "fast_food_restaurant",
    "food_court",
    "meal_takeaway",
    "meal_delivery",
    "bakery",
    "deli",
    "diner",
    "sandwich_shop",
  ],
  cafe: [
    "cafe",
    "coffee_shop",
    "tea_house",
    "cat_cafe",
    "dog_cafe",
    "dessert_shop",
    "ice_cream_shop",
    "juice_shop",
  ],
  bar: ["bar", "pub", "wine_bar", "bar_and_grill", "brewery"],
  museum: ["museum", "art_gallery", "planetarium"],
  landmark: [
    "tourist_attraction",
    "historical_landmark",
    "monument",
    "cultural_landmark",
    "historical_place",
    "church",
    "mosque",
    "hindu_temple",
    "synagogue",
    "place_of_worship",
    "observation_deck",
  ],
  park_nature: [
    "park",
    "national_park",
    "state_park",
    "hiking_area",
    "beach",
    "garden",
    "botanical_garden",
    "campground",
    "lake",
    "mountain_peak",
    "playground",
    "fishing_charter",
    "fishing_pier",
    "fishing_pond",
  ],
  shopping: ["shopping_mall", "market", "supermarket", "store"],
  stay: ["lodging", "hotel", "hostel", "motel", "resort_hotel", "bed_and_breakfast", "guest_house", "inn"],
  entertainment: [
    "movie_theater",
    "amusement_park",
    "night_club",
    "bowling_alley",
    "concert_hall",
    "performing_arts_theater",
    "stadium",
    "arena",
    "race_course",
    "zoo",
    "aquarium",
    "casino",
    "karaoke",
    "video_arcade",
  ],
  // Places to work out or play a sport. Stadiums and arenas, for watching, are Entertainment.
  sports: [
    "gym",
    "fitness_center",
    "yoga_studio",
    "sports_club",
    "sports_complex",
    "sports_coaching",
    "sports_school",
    "sports_activity_location",
    "athletic_field",
    "swimming_pool",
    "tennis_court",
    "golf_course",
    "indoor_golf_course",
    "ski_resort",
    "ice_skating_rink",
    "skateboard_park",
    "cycling_park",
  ],
  // Google's Education types.
  campus: [
    "university",
    "school",
    "primary_school",
    "secondary_school",
    "preschool",
    "library",
    "academic_department",
    "educational_institution",
    "research_institute",
    "school_district",
  ],
  airport: ["airport", "international_airport", "airstrip", "heliport"],
  // Whole towns and areas, not a place in them. A country stays Other.
  city: [
    "locality",
    "sublocality",
    "sublocality_level_1",
    "sublocality_level_2",
    "sublocality_level_3",
    "sublocality_level_4",
    "sublocality_level_5",
    "neighborhood",
    "postal_town",
    "administrative_area_level_1",
    "administrative_area_level_2",
    "administrative_area_level_3",
    "administrative_area_level_4",
    "administrative_area_level_5",
    "administrative_area_level_6",
    "administrative_area_level_7",
    "colloquial_area",
  ],
};

const BY_TYPE = new Map<string, Category>(
  Object.entries(GOOGLE_TYPES).flatMap(([category, types]) =>
    types.map((type) => [type, category as Category] as const),
  ),
);

// Exact matches win over the suffix rules (bar_and_grill is a bar, not food).
function categoryOf(type: string): Category | null {
  const exact = BY_TYPE.get(type);
  if (exact) return exact;
  if (type.endsWith("_restaurant")) return "food";
  if (type.endsWith("_store")) return "shopping";
  return null;
}

// primaryType first, then each entry in types in order; the first match wins.
export function categoryFromGoogle(
  primaryType: string | null | undefined,
  types: readonly string[] = [],
): Category {
  for (const type of primaryType ? [primaryType, ...types] : types) {
    const category = categoryOf(type);
    if (category) return category;
  }
  return "other";
}
