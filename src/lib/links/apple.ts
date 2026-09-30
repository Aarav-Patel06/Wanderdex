import type { ParsedLink } from "@/lib/links/parse";

// Apple's maps.apple/p/... share links land on maps.apple.com/place?place-id=..., which
// has no name or coordinates in the URL. The page's meta tags have both, so this reads
// og:title and place:location:latitude/longitude from it, and nothing else (SPEC §11.1).
// If Apple changes the page, these links fall back to Type Location (SPEC §22).

const TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024;

export function isApplePlacePage(url: URL) {
  return (
    url.protocol === "https:" &&
    url.hostname === "maps.apple.com" &&
    url.pathname === "/place" &&
    url.searchParams.has("place-id")
  );
}

// Fetches the page (no redirects, first 512 KB only) and reads it. Returns null if the
// page or its tags aren't usable. Throws on a network error or timeout.
export async function readApplePlace(url: URL): Promise<ParsedLink | null> {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status !== 200 || !res.body) {
    await res.body?.cancel();
    return null;
  }
  return parseApplePlaceHtml(await readStart(res.body, MAX_BYTES));
}

async function readStart(body: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, maxBytes - bytes);
      bytes += chunk.byteLength;
      html += decoder.decode(chunk, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return html + decoder.decode();
}

export function parseApplePlaceHtml(html: string): ParsedLink | null {
  const meta = metaProperties(html);
  const name = stripAppleSuffix(meta.get("og:title"));
  const lat = coordinate(meta.get("place:location:latitude"), 90);
  const lng = coordinate(meta.get("place:location:longitude"), 180);
  if (!name || lat === null || lng === null) return null;
  return { name, location: { lat, lng } };
}

// <meta property="..." content="..."> pairs; the first of each property wins.
function metaProperties(html: string) {
  const found = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      attrs.set(m[1].toLowerCase(), m[2] ?? m[3]);
    }
    const property = attrs.get("property");
    const content = attrs.get("content");
    if (property && content !== undefined && !found.has(property)) found.set(property, decodeEntities(content));
  }
  return found;
}

// "Parque del Oeste - Apple Maps" → "Parque del Oeste". A bare "Apple Maps" is Apple's
// generic title, not a place.
function stripAppleSuffix(title: string | undefined) {
  const name = title
    ?.replace(/\s*[-–—|]\s*Apple Maps\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return name && !/^apple maps$/i.test(name) ? name : null;
}

function coordinate(text: string | undefined, limit: number) {
  if (!text || !/^-?\d{1,3}(?:\.\d+)?$/.test(text.trim())) return null;
  const value = Number(text);
  return Math.abs(value) <= limit ? value : null;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== "#") return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
    const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}
