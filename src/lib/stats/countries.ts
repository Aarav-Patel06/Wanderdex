// What a visited place's country code counts toward on the profile (SPEC §14.6): the 195 states
// (the 193 UN members plus Vatican City and Palestine) count as themselves, a territory counts
// toward its sovereign, a disputed or partially recognized place counts as itself, and
// Antarctica counts toward none. Codes are ISO 3166-1 alpha-2, plus XK (Kosovo, which Google
// uses).

export const STATE_COUNT = 195;

// The 193 UN member states.
export const UN_MEMBERS = (
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ " +
  "CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR " +
  "GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN " +
  "MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PT PW PY QA " +
  "RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR " +
  "TT TV TZ UA UG US UY UZ VC VE VN VU WS YE ZA ZM ZW"
).split(" ");

// The two UN observer states counted with them.
export const OBSERVERS = ["VA", "PS"];

// Disputed or partially recognized places: each counts as itself, never merged into another
// state (Taiwan, Kosovo, Western Sahara).
export const DISPUTED = ["TW", "XK", "EH"];

// Counts toward no country (its continent still counts).
export const NO_COUNTRY = ["AQ"];

// Territories and dependencies, by the state they belong to (or are in free association with:
// the Cook Islands and Niue with New Zealand). The Falklands count toward the UK, which
// administers them.
export const TERRITORIES: Record<string, string> = {
  // China
  HK: "CN",
  MO: "CN",
  // United States
  AS: "US",
  GU: "US",
  MP: "US",
  PR: "US",
  UM: "US",
  VI: "US",
  // France
  BL: "FR",
  GF: "FR",
  GP: "FR",
  MF: "FR",
  MQ: "FR",
  NC: "FR",
  PF: "FR",
  PM: "FR",
  RE: "FR",
  TF: "FR",
  WF: "FR",
  YT: "FR",
  // United Kingdom
  AI: "GB",
  BM: "GB",
  FK: "GB",
  GG: "GB",
  GI: "GB",
  GS: "GB",
  IM: "GB",
  IO: "GB",
  JE: "GB",
  KY: "GB",
  MS: "GB",
  PN: "GB",
  SH: "GB",
  TC: "GB",
  VG: "GB",
  // Netherlands
  AW: "NL",
  BQ: "NL",
  CW: "NL",
  SX: "NL",
  // Denmark
  FO: "DK",
  GL: "DK",
  // Norway
  BV: "NO",
  SJ: "NO",
  // Finland
  AX: "FI",
  // Australia
  CC: "AU",
  CX: "AU",
  HM: "AU",
  NF: "AU",
  // New Zealand
  CK: "NZ",
  NU: "NZ",
  TK: "NZ",
};

const COUNTS_AS_ITSELF = new Set([...UN_MEMBERS, ...OBSERVERS, ...DISPUTED]);

// The country a place's code counts toward, or null: Antarctica, no code, or a code that isn't
// in these tables.
export function countryFor(code: string | null): string | null {
  if (!code) return null;
  if (COUNTS_AS_ITSELF.has(code)) return code;
  return TERRITORIES[code] ?? null;
}
