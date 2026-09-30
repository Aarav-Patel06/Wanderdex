import { afterEach, describe, expect, it, vi } from "vitest";

import { isApplePlacePage, parseApplePlaceHtml, readApplePlace } from "@/lib/links/apple";
import { APPLE_PLACE_PAGES } from "@/lib/links/fixtures";

const PAGE_URL = "https://maps.apple.com/place?place-id=IDBBDD355EAC5EAF5&_provider=9902";

const page = (tags: string) => `<html><head>${tags}</head></html>`;
const tags = (title: string, lat = "40.7266083", lng = "-73.9888537") =>
  `<meta property="og:title" content="${title}"><meta property="place:location:latitude" content="${lat}">` +
  `<meta property="place:location:longitude" content="${lng}">`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isApplePlacePage", () => {
  it.each(Object.keys(APPLE_PLACE_PAGES))("accepts %s", (href) => {
    expect(isApplePlacePage(new URL(href))).toBe(true);
  });

  it.each([
    ["no place-id", "https://maps.apple.com/place?q=Foo"],
    ["another path", "https://maps.apple.com/?place-id=X"],
    ["the short host", "https://maps.apple/place?place-id=X"],
    ["http", "http://maps.apple.com/place?place-id=X"],
    ["a lookalike host", "https://maps.apple.com.evil.io/place?place-id=X"],
  ])("rejects %s", (_, href) => {
    expect(isApplePlacePage(new URL(href))).toBe(false);
  });
});

describe("parseApplePlaceHtml", () => {
  it.each([
    ["IF0394FBA16E9D470", "Parque del Oeste", 40.4258461, -3.7205887],
    ["IDBBDD355EAC5EAF5", "Sushi By M", 40.7266083, -73.9888537],
    ["IDE4109562EE17B1C", "El Capitan", 37.73431, -119.6376],
  ])("reads the real page for %s", (id, name, lat, lng) => {
    const html = APPLE_PLACE_PAGES[`https://maps.apple.com/place?place-id=${id}&_provider=9902` as keyof typeof APPLE_PLACE_PAGES];
    expect(parseApplePlaceHtml(html)).toEqual({ name, location: { lat, lng } });
  });

  it.each(["Sushi By M - Apple Maps", "Sushi By M – Apple Maps", "Sushi By M | Apple Maps", "Sushi By M -apple maps "])(
    "strips the Apple Maps suffix from %j",
    (title) => {
      expect(parseApplePlaceHtml(page(tags(title)))?.name).toBe("Sushi By M");
    },
  );

  it("decodes HTML entities in the name", () => {
    expect(parseApplePlaceHtml(page(tags("Joe&#x2019;s &amp; Co&#39;s &quot;Bar&quot;")))?.name).toBe(
      "Joe’s & Co's \"Bar\"",
    );
  });

  it("handles single quotes, any attribute order, and extra attributes", () => {
    const html = page(
      `<meta content='Sushi By M' property='og:title'>` +
        `<meta data-x="1" property="place:location:latitude" content="40.7266083" />` +
        `<META PROPERTY="place:location:longitude" CONTENT="-73.9888537">`,
    );
    expect(parseApplePlaceHtml(html)).toEqual({ name: "Sushi By M", location: { lat: 40.7266083, lng: -73.9888537 } });
  });

  it("uses the first of a repeated tag", () => {
    expect(parseApplePlaceHtml(page(tags("First") + tags("Second")))?.name).toBe("First");
  });

  it("doesn't fall back to <title>", () => {
    const html = page(
      `<title>Sushi By M - Apple Maps</title><meta property="place:location:latitude" content="1">` +
        `<meta property="place:location:longitude" content="2">`,
    );
    expect(parseApplePlaceHtml(html)).toBeNull();
  });

  it.each([
    ["no og:title", page(tags("x").replace(/<meta property="og:title"[^>]*>/, ""))],
    ["no latitude", page(tags("Sushi By M").replace(/<meta property="place:location:latitude"[^>]*>/, ""))],
    ["no longitude", page(tags("Sushi By M").replace(/<meta property="place:location:longitude"[^>]*>/, ""))],
    ["an empty title", page(tags(" "))],
    ["Apple's generic title", page(tags("Apple Maps"))],
    ["only a suffix", page(tags(" - Apple Maps"))],
    ["a non-numeric latitude", page(tags("Sushi By M", "abc"))],
    ["an empty latitude", page(tags("Sushi By M", ""))],
    ["an exponent", page(tags("Sushi By M", "1e1"))],
    ["latitude out of range", page(tags("Sushi By M", "90.5"))],
    ["longitude out of range", page(tags("Sushi By M", "40", "-180.1"))],
    ["no tags at all", "<html><head><title>Apple Maps</title></head></html>"],
    ["an empty page", ""],
  ])("returns null for %s", (_, html) => {
    expect(parseApplePlaceHtml(html)).toBeNull();
  });

  it("accepts the edges of the coordinate range", () => {
    expect(parseApplePlaceHtml(page(tags("Pole", "-90", "180")))?.location).toEqual({ lat: -90, lng: 180 });
  });
});

describe("readApplePlace", () => {
  function mockFetch(res: Response) {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(res);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  // A body that never ends, in 64 KB chunks, with the tags in the first chunk.
  function endlessBody(first: string) {
    let pulls = 0;
    let cancelled = false;
    const filler = new Uint8Array(64 * 1024).fill(0x20);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(pulls++ === 0 ? new TextEncoder().encode(first.padEnd(64 * 1024)) : filler);
      },
      cancel() {
        cancelled = true;
      },
    });
    return { stream, pulls: () => pulls, cancelled: () => cancelled };
  }

  it("fetches exactly that URL, without following redirects, with a timeout", async () => {
    const fetchMock = mockFetch(new Response(APPLE_PLACE_PAGES[PAGE_URL]));
    expect(await readApplePlace(new URL(PAGE_URL))).toEqual({
      name: "Sushi By M",
      location: { lat: 40.7266083, lng: -73.9888537 },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe(PAGE_URL);
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops reading at 512 KB", async () => {
    const body = endlessBody(tags("Sushi By M"));
    mockFetch(new Response(body.stream));
    expect(await readApplePlace(new URL(PAGE_URL))).toMatchObject({ name: "Sushi By M" });
    expect(body.cancelled()).toBe(true);
    expect(body.pulls()).toBeLessThanOrEqual(10); // 8 chunks of 64 KB, plus stream read-ahead
  });

  it("ignores tags after the first 512 KB", async () => {
    const html = `<html><head>${" ".repeat(600 * 1024)}${tags("Sushi By M")}</head></html>`;
    mockFetch(new Response(html));
    expect(await readApplePlace(new URL(PAGE_URL))).toBeNull();
  });

  it.each([
    ["a redirect", new Response(null, { status: 302, headers: { location: "https://maps.apple.com/" } })],
    ["a 404", new Response(APPLE_PLACE_PAGES[PAGE_URL], { status: 404 })],
    ["a page without the tags", new Response("<html><head><title>Apple Maps</title></head></html>")],
  ])("returns null for %s", async (_, res) => {
    const fetchMock = mockFetch(res);
    expect(await readApplePlace(new URL(PAGE_URL))).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on a network error or timeout", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new DOMException("t", "TimeoutError")));
    await expect(readApplePlace(new URL(PAGE_URL))).rejects.toThrow();
  });
});
