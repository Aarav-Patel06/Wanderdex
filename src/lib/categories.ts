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
    "zoo",
    "aquarium",
    "casino",
    "karaoke",
    "video_arcade",
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
