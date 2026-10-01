import type { SavedVisit } from "@/lib/visits";

export type SaveToast = { title: string; description: string; variant: "success" | "visited" };

// The toasts after a save (SPEC §11.6 step 6), in the order to fire them. Sonner shows the newest
// on top, so the first-country toast goes first and ends up below the other one. A visit to a
// place the user already had visits at is a return visit instead of a new place.
export function saveToasts({ place, return_visit, first_in_country }: SavedVisit): SaveToast[] {
  const toasts: SaveToast[] = [];
  if (first_in_country) {
    toasts.push({
      title: "First visit to a new country!",
      description: `You visited ${place.country ?? place.country_code} for the first time!`,
      variant: "visited",
    });
  }
  toasts.push(
    return_visit
      ? { title: "Return visit!", description: `Another visit to ${place.name} logged.`, variant: "success" }
      : { title: "New place discovered!", description: `${place.name} added to your Wanderdex.`, variant: "success" },
  );
  return toasts;
}
