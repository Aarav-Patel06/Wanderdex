import { afterEach, describe, expect, it, vi } from "vitest";

import { expandLink, ExpandError } from "@/lib/links/expand";
import { APPLE_SHORT_LINKS, CREPE_STATION, GOOGLE_SHORT_LINKS } from "@/lib/links/fixtures";

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

// Each call answers with the next response in the list.
function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  responses.forEach((res) => fetchMock.mockResolvedValueOnce(res));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function expandError(href: string) {
  const error = await expandLink(new URL(href)).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ExpandError);
  return (error as ExpandError).reason;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("expandLink", () => {
  it.each(Object.entries({ ...GOOGLE_SHORT_LINKS, ...APPLE_SHORT_LINKS }))(
    "expands %s without fetching the final page",
    async (short, final) => {
      const fetchMock = mockFetch(redirect(final, short.includes("apple") ? 301 : 302));
      expect((await expandLink(new URL(short))).href).toBe(new URL(final).href);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("follows redirects by hand, with a timeout signal", async () => {
    const fetchMock = mockFetch(redirect(CREPE_STATION));
    await expandLink(new URL("https://maps.app.goo.gl/abc"));
    const init = fetchMock.mock.calls[0][1];
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns long links unchanged without fetching", async () => {
    const fetchMock = mockFetch();
    expect((await expandLink(new URL(CREPE_STATION))).href).toBe(new URL(CREPE_STATION).href);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows a chain of short links", async () => {
    const fetchMock = mockFetch(redirect("https://maps.app.goo.gl/abc", 301), redirect(CREPE_STATION));
    expect((await expandLink(new URL("https://goo.gl/maps/xyz"))).href).toBe(new URL(CREPE_STATION).href);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves a relative Location", async () => {
    mockFetch(redirect("/p/next"), redirect("https://maps.apple.com/?q=Foo"));
    expect((await expandLink(new URL("https://maps.apple/p/abc"))).href).toBe("https://maps.apple.com/?q=Foo");
  });

  it("allows 5 redirects", async () => {
    const hops = Array.from({ length: 4 }, (_, i) => redirect(`https://maps.app.goo.gl/${i}`));
    mockFetch(...hops, redirect(CREPE_STATION));
    await expect(expandLink(new URL("https://maps.app.goo.gl/start"))).resolves.toBeInstanceOf(URL);
  });

  it("stops after 5 redirects", async () => {
    const hops = Array.from({ length: 6 }, (_, i) => redirect(`https://maps.app.goo.gl/${i}`));
    const fetchMock = mockFetch(...hops);
    expect(await expandError("https://maps.app.goo.gl/start")).toBe("unreadable");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["another site", "https://example.com/"],
    ["a lookalike host", "https://maps.app.goo.gl.evil.io/abc"],
    ["http", "http://www.google.com/maps/place/Foo"],
    ["google.com outside /maps", "https://www.google.com/sorry/index"],
    ["a consent page", "https://consent.google.com/ml?continue=https://www.google.com/maps/place/Foo"],
    ["a bad URL", "https://["],
  ])("refuses a redirect to %s", async (_, location) => {
    const fetchMock = mockFetch(redirect(location));
    expect(await expandError("https://maps.app.goo.gl/abc")).toBe("unreadable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([200, 404])("fails when a short link answers %i", async (status) => {
    mockFetch(new Response("Dynamic Link Not Found", { status }));
    expect(await expandError("https://maps.app.goo.gl/dead")).toBe("unreadable");
  });

  it("fails on a redirect with no Location", async () => {
    mockFetch(new Response(null, { status: 302 }));
    expect(await expandError("https://maps.app.goo.gl/abc")).toBe("unreadable");
  });

  it("reports network errors and timeouts as network", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await expandError("https://maps.app.goo.gl/abc")).toBe("network");
  });
});
