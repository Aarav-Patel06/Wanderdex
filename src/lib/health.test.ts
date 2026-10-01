import { describe, expect, it } from "vitest";

import { healthTokenMatches } from "@/lib/health";

const TOKEN = "s3cret-token";

describe("healthTokenMatches", () => {
  it("accepts the exact token as a bearer token", () => {
    expect(healthTokenMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["empty header", ""],
    ["wrong token", "Bearer nope"],
    ["token with a different length", `Bearer ${TOKEN}x`],
    ["token prefix only", `Bearer ${TOKEN.slice(0, 4)}`],
    ["different case", `Bearer ${TOKEN.toUpperCase()}`],
    ["no Bearer scheme", TOKEN],
    ["another scheme", `Basic ${TOKEN}`],
    ["lowercase scheme", `bearer ${TOKEN}`],
    ["empty bearer token", "Bearer "],
    ["extra space", `Bearer  ${TOKEN}`],
  ])("rejects %s", (_, header) => {
    expect(healthTokenMatches(header, TOKEN)).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("rejects every request when the expected token is %s", (_, expected) => {
    expect(healthTokenMatches("Bearer ", expected)).toBe(false);
    expect(healthTokenMatches("Bearer anything", expected)).toBe(false);
    expect(healthTokenMatches(null, expected)).toBe(false);
  });
});
