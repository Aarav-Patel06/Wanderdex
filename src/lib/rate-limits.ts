import type { GoogleSku } from "@/lib/google/places";

// Every rate limit in one place (SPEC §17). Enforced by lib/rate-limit.

// Lookups per user (/api/resolve/*, and manual-place saves), over sliding windows.
export const LOOKUPS_PER_HOUR = 60;
export const LOOKUPS_PER_DAY = 300;

// Google Places calls per SKU across all users, per calendar month (UTC). Google's free allowance
// is 5,000 a month for each of these Pro SKUs; the margin covers simultaneous requests that both
// pass the check just below a cap.
export const GOOGLE_CALLS_PER_MONTH: Record<GoogleSku, number> = {
  text_search: 4500,
  nearby_search: 4500,
};
