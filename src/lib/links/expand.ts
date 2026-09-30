import { isShortLink, mapsProvider } from "@/lib/links/validate";

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 5000;

// "unreadable": the link didn't lead to a Maps URL (dead link, too many hops, or a
// redirect off the allowlist). "network": fetch failed or timed out.
export class ExpandError extends Error {
  constructor(readonly reason: "unreadable" | "network") {
    super(`Short link expansion failed: ${reason}`);
  }
}

// Expands a short link by following its redirects by hand (SPEC §11.1 step 2). Every
// hop must be https and a supported Maps host, so a link can't send the server
// anywhere else. Stops at the first URL that isn't a short link, without fetching it.
// Long links come back unchanged.
export async function expandLink(url: URL): Promise<URL> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = url;

  for (let hops = 0; isShortLink(current); hops++) {
    if (hops === MAX_REDIRECTS) throw new ExpandError("unreadable");

    let res: Response;
    try {
      res = await fetch(current, { redirect: "manual", signal });
      await res.body?.cancel();
    } catch {
      throw new ExpandError("network");
    }

    const location = res.headers.get("location");
    if (res.status < 300 || res.status > 399 || !location) throw new ExpandError("unreadable");

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new ExpandError("unreadable");
    }
    if (next.protocol !== "https:" || !mapsProvider(next)) throw new ExpandError("unreadable");
    current = next;
  }

  return current;
}
