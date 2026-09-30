// Supported Maps hosts (SPEC §11.1 step 1). Also the allowlist for every redirect hop
// when expanding short links (expand.ts).

// google.com, google.de, google.co.uk, google.com.au, ...
const TLD = String.raw`[a-z]{2,3}(?:\.[a-z]{2})?`;
const GOOGLE_HOST = new RegExp(`^(?:www\\.)?google\\.${TLD}$`);
const MAPS_GOOGLE_HOST = new RegExp(`^maps\\.google\\.${TLD}$`);

const SHORT_HOSTS = ["maps.app.goo.gl", "goo.gl", "maps.apple"];

export type MapsProvider = "google" | "apple";

export function mapsProvider(url: URL): MapsProvider | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.port || url.username || url.password) return null;

  const host = url.hostname;
  const path = url.pathname;
  if (host === "maps.app.goo.gl") return "google";
  if (host === "goo.gl" && path.startsWith("/maps/")) return "google";
  if (GOOGLE_HOST.test(host) && (path === "/maps" || path.startsWith("/maps/"))) return "google";
  if (MAPS_GOOGLE_HOST.test(host)) return "google";
  if (host === "maps.apple.com" || host === "maps.apple") return "apple";
  return null;
}

export function isShortLink(url: URL) {
  return SHORT_HOSTS.includes(url.hostname);
}

// Reads a supported Maps link out of what the user pasted. Share sheets often add the
// place name before the link, and people sometimes drop the "https://". Returns null
// for anything that isn't a supported Maps URL.
export function readMapsLink(input: string): URL | null {
  let raw = input.match(/https?:\/\/\S+/i)?.[0] ?? input.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  if (/\s/.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!mapsProvider(url)) return null;
  url.protocol = "https:";
  return url;
}
