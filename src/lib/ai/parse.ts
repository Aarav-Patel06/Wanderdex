import { z } from "zod";

import { isLocalValue, PRECISIONS, type Precision } from "@/lib/dates";

// Turns Type Location text into a place search plus an optional visit date (SPEC §12.3).
// The model only interprets the text; every fact about the place comes from Google.
// Server only: uses GEMINI_API_KEY.

export type ParseInput = {
  text: string;
  today: string; // "YYYY-MM-DD" in the user's zone
  timeZone: string; // the user's IANA zone
};

export type ParsedText = {
  query: string;
  location_hint: string | null;
  visited: { value: string; precision: Precision } | null;
};

// A provider returns null on any failure (error, timeout, 429, bad output), so the
// caller can fall back to searching the raw text (SPEC §11.3 step 4).
export type TextParser = (input: ParseInput) => Promise<ParsedText | null>;

// The model's output, per the §12.3 schema. value and precision are both null (no
// date) or both set, with value in the format for its precision.
export const parsedTextSchema = z.object({
  query: z.string().trim().min(1).max(200),
  location_hint: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .transform((hint) => hint || null),
  visited: z
    .object({ value: z.string().nullable(), precision: z.enum(PRECISIONS).nullable() })
    .refine(({ value, precision }) =>
      value === null || precision === null ? value === precision : isLocalValue(value, precision),
    )
    .transform(({ value, precision }) => (value !== null && precision !== null ? { value, precision } : null)),
});

export const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 5000;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    query: { type: "string" },
    location_hint: { type: ["string", "null"] },
    visited: {
      type: "object",
      properties: {
        value: { type: ["string", "null"] },
        precision: { type: ["string", "null"], enum: [...PRECISIONS, null] },
      },
      required: ["value", "precision"],
    },
  },
  required: ["query", "location_hint", "visited"],
};

const INSTRUCTIONS = `You turn a traveler's short note about a place they visited into a Google Places search. Reply with JSON only.

query: the place to search for, as the user described it (a name like "Ichiran Ramen" or "the Louvre", or a description like "coffee shop near Shibuya station"). Leave out dates and filler like "I went to". Never add anything that isn't in the text: no addresses, coordinates, or guesses about which place they mean.

location_hint: a city, area, or country named in the text that narrows the search (for example "Tokyo"), or null if there is none. Don't repeat words already in query.

visited: when they visited. Resolve relative dates ("two weeks ago", "yesterday") against today's date in the user's time zone. "Last March" or "in March" means the most recent March on or before today.
- Exact time known: value "YYYY-MM-DDTHH:mm", precision "datetime".
- Day known: value "YYYY-MM-DD", precision "date".
- Only the month known: value "YYYY-MM", precision "month".
- No date, or only a year or season: value null, precision null.`;

export const gemini: TextParser = async ({ text, today, timeZone }) => {
  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [
          { role: "user", parts: [{ text: `Today's date: ${today}\nUser's time zone: ${timeZone}\nText: ${text}` }] },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`Gemini ${res.status}:`, await res.text().catch(() => ""));
      return null;
    }

    const data: GeminiResponse = await res.json();
    const output = data.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");
    const parsed = parsedTextSchema.safeParse(JSON.parse(output ?? ""));
    if (!parsed.success) console.warn("Gemini output didn't match the schema:", output);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn("Gemini parse failed:", error);
    return null;
  }
};

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
};

// The provider in use. The Claude Haiku fallback (SPEC §12.3) would be another
// TextParser swapped in here.
export const parseText: TextParser = gemini;
