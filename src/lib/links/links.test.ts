import { describe, expect, it } from "vitest";

import { APPLE_SHORT_LINKS, CREPE_STATION, GOOGLE_SHORT_LINKS } from "@/lib/links/fixtures";
import { parseMapsLink } from "@/lib/links/parse";
import { isShortLink, readMapsLink } from "@/lib/links/validate";

function parse(href: string) {
  return parseMapsLink(new URL(href));
}

describe("readMapsLink", () => {
  it.each([
    ...Object.keys(GOOGLE_SHORT_LINKS),
    ...Object.values(GOOGLE_SHORT_LINKS),
    ...Object.keys(APPLE_SHORT_LINKS),
    ...Object.values(APPLE_SHORT_LINKS),
    CREPE_STATION,
    "https://goo.gl/maps/abc123",
    "https://google.com/maps/place/Foo",
    "https://www.google.com/maps?q=Foo",
    "https://www.google.co.uk/maps/place/Foo",
    "https://www.google.com.au/maps/search/Foo",
    "https://www.google.de/maps/@52.5,13.4,12z",
    "https://maps.google.com/?q=Foo",
    "https://maps.google.co.jp/maps?q=Foo",
    "https://maps.apple.com/?q=Foo",
    "https://maps.apple/p/abc",
  ])("accepts %s", (input) => {
    expect(readMapsLink(input)).not.toBeNull();
  });

  it("adds https:// when it's missing", () => {
    expect(readMapsLink("maps.app.goo.gl/T1mQoo55x2b14Ztr9")?.href).toBe(
      "https://maps.app.goo.gl/T1mQoo55x2b14Ztr9",
    );
  });

  it("upgrades http to https", () => {
    expect(readMapsLink("http://maps.apple.com/?q=Foo")?.protocol).toBe("https:");
  });

  it("trims and ignores host case", () => {
    expect(readMapsLink("  HTTPS://MAPS.APP.GOO.GL/abc  ")?.href).toBe("https://maps.app.goo.gl/abc");
  });

  it("finds the link inside share text", () => {
    expect(readMapsLink("Joe’s on Newbury\nhttps://maps.app.goo.gl/T1mQoo55x2b14Ztr9")?.href).toBe(
      "https://maps.app.goo.gl/T1mQoo55x2b14Ztr9",
    );
  });

  it.each([
    ["empty", ""],
    ["plain text", "Eiffel Tower"],
    ["other site", "https://example.com/maps/place/Foo"],
    ["goo.gl outside /maps", "https://goo.gl/abc123"],
    ["google.com outside /maps", "https://www.google.com/search?q=Foo"],
    ["google lookalike", "https://google.evil.com/maps/place/Foo"],
    ["google as a subdomain", "https://www.google.com.evil.io/maps/place/Foo"],
    ["prefix on the domain", "https://evilgoogle.com/maps/place/Foo"],
    ["apple lookalike", "https://maps.apple.com.evil.io/?q=Foo"],
    ["other scheme", "ftp://maps.apple.com/?q=Foo"],
    ["javascript", "javascript:alert(1)"],
    ["port", "https://maps.app.goo.gl:8443/abc"],
    ["credentials", "https://user:pw@maps.app.goo.gl/abc"],
  ])("rejects %s", (_, input) => {
    expect(readMapsLink(input)).toBeNull();
  });
});

describe("isShortLink", () => {
  it.each(["https://maps.app.goo.gl/x", "https://goo.gl/maps/x", "https://maps.apple/p/x"])(
    "%s is short",
    (href) => expect(isShortLink(new URL(href))).toBe(true),
  );

  it.each([CREPE_STATION, "https://maps.apple.com/place?place-id=X"])("%s is not short", (href) =>
    expect(isShortLink(new URL(href))).toBe(false),
  );
});

describe("parseMapsLink: Google /maps/place (real links)", () => {
  it.each([
    ["T1mQoo55x2b14Ztr9", "Joe’s on Newbury", 42.350511, -71.07966],
    ["1bJbqymfq1AcVN1A8", "Kempegowda International Airport Bengaluru", 13.198909, 77.7068926],
    ["j4UyLMnTG6VBvonZ9", "Kanha Tiger Reserve", 22.2994956, 80.5864278],
    ["R612eWtEo1khkuae6", "Berkeley Art Museum and Pacific Film Archive", 37.8707356, -122.2664841],
    ["EYqwLwSTxiSbskXy5", "Ristorante Pizzeria 5 Torri", 46.5387619, 12.1362378],
  ] as const)("%s → %s", (code, name, lat, lng) => {
    const final = GOOGLE_SHORT_LINKS[`https://maps.app.goo.gl/${code}`];
    expect(parse(final)).toEqual({ name, location: { lat, lng } });
  });

  it("uses !3d/!4d over @ and decodes the raw ê", () => {
    expect(parse(CREPE_STATION)).toEqual({
      name: "Crêpe Station",
      location: { lat: 48.8694204, lng: 2.2890529 },
    });
  });

  it("uses @ when there is no !3d/!4d", () => {
    expect(parse("https://www.google.com/maps/place/Foo+Bar/@40.1,-73.2,17z")).toEqual({
      name: "Foo Bar",
      location: { lat: 40.1, lng: -73.2 },
    });
  });

  it("reads a name with no coordinates", () => {
    expect(parse("https://www.google.com/maps/place/Foo+Bar")).toEqual({ name: "Foo Bar", location: null });
  });

  it("keeps an encoded + as a plus sign", () => {
    expect(parse("https://www.google.com/maps/place/A%2BB+Bistro/@1,2,17z")?.name).toBe("A+B Bistro");
  });

  it("keeps a name with a stray % instead of failing", () => {
    expect(parse("https://www.google.com/maps/place/100%25+Cafe/@1,2,17z")?.name).toBe("100% Cafe");
    expect(parse("https://www.google.com/maps/place/100%+Cafe/@1,2,17z")?.name).toBe("100% Cafe");
  });

  it("treats a dropped pin's degree name as coordinates only", () => {
    const href =
      "https://www.google.com/maps/place/48%C2%B051'29.6%22N+2%C2%B017'40.2%22E/@48.8582,2.2945,17z/data=!3m1!4b1!4m4!3m3!8m2!3d48.858222!4d2.2945";
    expect(parse(href)).toEqual({ name: null, location: { lat: 48.858222, lng: 2.2945 } });
  });

  it("treats a decimal-coordinate name as coordinates only", () => {
    expect(parse("https://www.google.com/maps/place/48.8584,2.2945/@48.9,2.3,15z")).toEqual({
      name: null,
      location: { lat: 48.8584, lng: 2.2945 },
    });
  });
});

describe("parseMapsLink: Google /maps/search", () => {
  it("reads the query and @ coordinates", () => {
    expect(parse("https://www.google.com/maps/search/coffee+near+louvre/@48.8606,2.3376,15z")).toEqual({
      name: "coffee near louvre",
      location: { lat: 48.8606, lng: 2.3376 },
    });
  });

  it("reads a coordinate query as the point, not the map center", () => {
    expect(parse("https://www.google.com/maps/search/48.8584,+2.2945/@48.9,2.3,12z")).toEqual({
      name: null,
      location: { lat: 48.8584, lng: 2.2945 },
    });
  });
});

describe("parseMapsLink: Google ?q= and ?query=", () => {
  it.each([
    ["https://maps.google.com/?q=Brandenburg+Gate", "Brandenburg Gate"],
    ["https://www.google.co.uk/maps?q=Tower%20Bridge", "Tower Bridge"],
    ["https://www.google.com/maps/search/?api=1&query=Eiffel%20Tower", "Eiffel Tower"],
    ["https://www.google.com/maps/search/?api=1&query=Caf%C3%A9+de+Flore", "Café de Flore"],
  ])("%s → %s", (href, name) => {
    expect(parse(href)).toEqual({ name, location: null });
  });

  it.each([
    ["https://maps.google.com/maps?q=52.5163,13.3777", 52.5163, 13.3777],
    ["https://www.google.com/maps?q=-33.8568,+151.2153", -33.8568, 151.2153],
    ["https://www.google.com/maps/search/?api=1&query=48.8584%2C2.2945", 48.8584, 2.2945],
  ])("%s → coordinates", (href, lat, lng) => {
    expect(parse(href)).toEqual({ name: null, location: { lat, lng } });
  });
});

describe("parseMapsLink: Apple", () => {
  it("reads q= and ll=", () => {
    expect(parse("https://maps.apple.com/?q=Blue+Bottle+Coffee&ll=37.7825,-122.4079")).toEqual({
      name: "Blue Bottle Coffee",
      location: { lat: 37.7825, lng: -122.4079 },
    });
  });

  it("reads name= and coordinate=", () => {
    expect(parse("https://maps.apple.com/place?name=Ferry%20Building&coordinate=37.7955,-122.3937")).toEqual({
      name: "Ferry Building",
      location: { lat: 37.7955, lng: -122.3937 },
    });
  });

  it("reads address= when there's no name", () => {
    expect(parse("https://maps.apple.com/?address=1+Infinite+Loop,+Cupertino,+CA")).toEqual({
      name: "1 Infinite Loop, Cupertino, CA",
      location: null,
    });
  });

  it("prefers name=, then q=, then address=", () => {
    expect(parse("https://maps.apple.com/?address=A+St&q=Cafe+Q&name=Cafe+N")?.name).toBe("Cafe N");
    expect(parse("https://maps.apple.com/?address=A+St&q=Cafe+Q")?.name).toBe("Cafe Q");
  });

  it("prefers coordinate= over ll=", () => {
    expect(parse("https://maps.apple.com/?ll=1,2&coordinate=3,4")?.location).toEqual({ lat: 3, lng: 4 });
  });

  it("reads coordinates only", () => {
    expect(parse("https://maps.apple.com/?ll=37.7955,-122.3937")).toEqual({
      name: null,
      location: { lat: 37.7955, lng: -122.3937 },
    });
  });

  it("works on the maps.apple short host too", () => {
    expect(parse("https://maps.apple/?q=Foo")).toEqual({ name: "Foo", location: null });
  });
});

describe("parseMapsLink: failures", () => {
  it.each([
    ["a map view with no place", "https://www.google.com/maps/@48.85,2.29,15z"],
    ["directions", "https://www.google.com/maps/dir/Paris/Lyon"],
    ["bare /maps", "https://www.google.com/maps"],
    ["empty q", "https://maps.google.com/?q="],
    ["an unsupported host", "https://example.com/maps/place/Foo/@1,2,17z"],
    ["bare Apple", "https://maps.apple.com/"],
    ["out-of-range coordinates", "https://maps.apple.com/?ll=95,200"],
    ...Object.values(APPLE_SHORT_LINKS).map((href) => ["an Apple place-id-only link", href]),
  ])("returns null for %s", (_, href) => {
    expect(parse(href)).toBeNull();
  });
});
