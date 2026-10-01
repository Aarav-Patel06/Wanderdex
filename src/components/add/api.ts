import type { ResolveErrorCode } from "@/lib/resolve";

// The error codes /api/resolve/* and /api/visits return, as the copy the user sees (SPEC §11.7).
// invalid_input has no row of its own (the forms don't send empty or oversized input), so it
// gets the generic error; unauthorized sends the user to log in instead.
const ERROR_COPY: Partial<Record<ResolveErrorCode, string>> = {
  not_maps_link: "That doesn't look like a Maps link.",
  link_unparseable: "Couldn't read that link. Try typing the place instead.",
  no_results: "No places found. Drop a pin instead?",
  rate_limited: "Slow down, traveler! Try again in a bit.",
  upstream_error: "The map spirits aren't answering. Try again.",
  // A tampered or expired (24 h) lookup result; looking the place up again fixes it.
  place_unverified: "The map spirits aren't answering. Try again.",
};

export function errorCopy(code: ResolveErrorCode) {
  return ERROR_COPY[code] ?? ERROR_COPY.upstream_error!;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  // name: the name a link error carries (or null), for Type Location.
  | { ok: false; error: ResolveErrorCode; name: string | null };

export function postJson<T>(url: string, body: unknown) {
  return sendJson<T>("POST", url, body);
}

// Sends JSON (if there's a body) to one of our route handlers. A network failure, or a response
// that isn't one of our JSON errors, counts as upstream_error.
export async function sendJson<T>(
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const json = await res.json();
    if (res.ok) return { ok: true, data: json as T };
    const error = typeof json?.error === "string" ? (json.error as ResolveErrorCode) : "upstream_error";
    return { ok: false, error, name: typeof json?.name === "string" ? json.name : null };
  } catch {
    return { ok: false, error: "upstream_error", name: null };
  }
}
