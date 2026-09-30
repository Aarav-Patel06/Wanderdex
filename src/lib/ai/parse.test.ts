import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gemini, GEMINI_MODEL, parsedTextSchema } from "@/lib/ai/parse";

const INPUT = { text: "ramen at ichiran in shibuya last march", today: "2026-09-29", timeZone: "America/New_York" };

// A generateContent response whose text is `output`.
function geminiReply(output: unknown) {
  const text = typeof output === "string" ? output : JSON.stringify(output);
  return Response.json({ candidates: [{ content: { role: "model", parts: [{ text }] } }] });
}

function mockFetch(res: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("gemini", () => {
  it("sends the text, today's date, and the zone with temperature 0 and a JSON schema", async () => {
    const fetchMock = mockFetch(
      geminiReply({ query: "Ichiran", location_hint: "Shibuya", visited: { value: "2026-03", precision: "month" } }),
    );
    await gemini(INPUT);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(init?.body as string);
    expect(body.generationConfig).toMatchObject({ temperature: 0, responseMimeType: "application/json" });
    expect(body.generationConfig.responseJsonSchema.required).toEqual(["query", "location_hint", "visited"]);
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toContain("2026-09-29");
    expect(prompt).toContain("America/New_York");
    expect(prompt).toContain(INPUT.text);
  });

  it("returns the validated output", async () => {
    mockFetch(
      geminiReply({ query: " Ichiran ", location_hint: "Shibuya", visited: { value: "2026-03", precision: "month" } }),
    );
    expect(await gemini(INPUT)).toEqual({
      query: "Ichiran",
      location_hint: "Shibuya",
      visited: { value: "2026-03", precision: "month" },
    });
  });

  it("maps a missing date to visited: null", async () => {
    mockFetch(geminiReply({ query: "the louvre", location_hint: null, visited: { value: null, precision: null } }));
    expect(await gemini(INPUT)).toEqual({ query: "the louvre", location_hint: null, visited: null });
  });

  it("skips thought parts", async () => {
    const output = { query: "Ichiran", location_hint: null, visited: { value: null, precision: null } };
    mockFetch(
      Response.json({
        candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: JSON.stringify(output) }] } }],
      }),
    );
    expect(await gemini(INPUT)).toMatchObject({ query: "Ichiran" });
  });

  it.each([
    ["a 429", () => Response.json({ error: { code: 429 } }, { status: 429 })],
    ["a 500", () => new Response("oops", { status: 500 })],
    ["no candidates", () => Response.json({ candidates: [] })],
    ["invalid JSON", () => geminiReply("{not json")],
    ["a missing query", () => geminiReply({ location_hint: null, visited: { value: null, precision: null } })],
    ["an empty query", () => geminiReply({ query: " ", location_hint: null, visited: { value: null, precision: null } })],
  ])("returns null on %s", async (_, res) => {
    mockFetch(res());
    expect(await gemini(INPUT)).toBeNull();
  });

  it("returns null on a network error or timeout", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new DOMException("t", "TimeoutError")));
    expect(await gemini(INPUT)).toBeNull();
  });
});

describe("parsedTextSchema", () => {
  const base = { query: "x", location_hint: null };

  it.each([
    [{ value: "2025-03-12T15:45", precision: "datetime" }],
    [{ value: "2025-03-12", precision: "date" }],
    [{ value: "2025-03", precision: "month" }],
  ])("accepts %o", (visited) => {
    expect(parsedTextSchema.parse({ ...base, visited }).visited).toEqual(visited);
  });

  it("turns an empty location hint into null", () => {
    expect(parsedTextSchema.parse({ ...base, location_hint: " ", visited: { value: null, precision: null } }).location_hint).toBeNull();
  });

  it.each([
    ["value without precision", { value: "2025-03", precision: null }],
    ["precision without value", { value: null, precision: "month" }],
    ["value in the wrong format", { value: "2025-03-12", precision: "month" }],
    ["an impossible date", { value: "2025-02-30", precision: "date" }],
    ["an unknown precision", { value: "2025", precision: "year" }],
  ])("rejects %s", (_, visited) => {
    expect(parsedTextSchema.safeParse({ ...base, visited }).success).toBe(false);
  });
});
