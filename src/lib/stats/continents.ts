// The continent a country code is on (SPEC §14.6), from the UN geoscheme (M49): transcontinental
// countries go where it puts them (Russia → Europe; Türkiye, Cyprus, and the Caucasus → Asia;
// Egypt → Africa), North America is its Northern America, Central America, and Caribbean, and a
// territory is on the continent where it lies, not its sovereign's (French Guiana → South
// America). Every ISO 3166-1 alpha-2 code, plus XK (Kosovo).

export const CONTINENTS = [
  "Africa",
  "Antarctica",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
] as const;

export type Continent = (typeof CONTINENTS)[number];

const CODES: Record<Continent, string> = {
  Africa:
    "DZ EG LY MA SD TN EH BI KM DJ ER ET KE MG MW MU MZ RW SC SO SS UG TZ ZM ZW IO TF RE YT " +
    "AO CM CF TD CG CD GQ GA ST BW SZ LS NA ZA BJ BF CV CI GM GH GN GW LR ML MR NE NG SN SL TG SH",
  Antarctica: "AQ",
  Asia:
    "KZ KG TJ TM UZ CN HK MO KP JP MN KR TW BN KH ID LA MY MM PH SG TH TL VN " +
    "AF BD BT IN IR MV NP PK LK AM AZ BH CY GE IQ IL JO KW LB OM QA SA PS SY TR AE YE",
  Europe:
    "BY BG CZ HU PL MD RO RU SK UA AX DK EE FO FI GG IS IE IM JE LV LT NO SJ SE GB " +
    "AL AD BA HR GI GR VA IT MT ME MK PT SM RS SI ES XK AT BE FR DE LI LU MC NL CH",
  "North America":
    "BM CA GL PM US BZ CR SV GT HN MX NI PA " +
    "AI AG AW BS BB BQ VG KY CU CW DM DO GD GP HT JM MQ MS PR BL KN LC MF VC SX TT TC VI",
  Oceania: "AU CX CC HM NZ NF FJ NC PG SB VU GU KI MH FM NR MP PW UM AS CK PF NU PN WS TK TO TV WF",
  "South America": "AR BO BV BR CL CO EC FK GF GY PY PE GS SR UY VE",
};

export const CONTINENT_OF: Record<string, Continent> = Object.fromEntries(
  CONTINENTS.flatMap((continent) => CODES[continent].split(" ").map((code) => [code, continent])),
);

// The continent a place's code is on, or null without a code (or with one these tables don't know).
export function continentFor(code: string | null): Continent | null {
  return (code && CONTINENT_OF[code]) || null;
}
