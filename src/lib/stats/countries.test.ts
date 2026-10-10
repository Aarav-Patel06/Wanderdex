import { describe, expect, it } from "vitest";

import { CONTINENT_OF, CONTINENTS, continentFor } from "@/lib/stats/continents";
import { DISPUTED, NO_COUNTRY, OBSERVERS, STATE_COUNT, TERRITORIES, UN_MEMBERS, countryFor } from "@/lib/stats/countries";

// Every officially assigned ISO 3166-1 alpha-2 code (249), as an independent reference.
const ISO_3166_1 = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR " +
  "BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ " +
  "EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW " +
  "GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY " +
  "KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV " +
  "MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY " +
  "QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG " +
  "TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");
const ALL_CODES = [...ISO_3166_1, "XK"];

describe("the 195 states", () => {
  it("are 193 UN members plus Vatican City and Palestine, with no repeats", () => {
    expect(ISO_3166_1).toHaveLength(249);
    expect(new Set(UN_MEMBERS).size).toBe(193);
    expect(OBSERVERS).toEqual(["VA", "PS"]);
    const states = new Set([...UN_MEMBERS, ...OBSERVERS]);
    expect(states.size).toBe(STATE_COUNT);
    expect(STATE_COUNT).toBe(195);
    for (const code of states) expect(ISO_3166_1).toContain(code);
  });

  it("each count as themselves", () => {
    for (const code of [...UN_MEMBERS, ...OBSERVERS]) expect(countryFor(code)).toBe(code);
  });
});

describe("countryFor", () => {
  it("classifies every ISO code (and XK) exactly once", () => {
    const groups = [UN_MEMBERS, OBSERVERS, DISPUTED, NO_COUNTRY, Object.keys(TERRITORIES)];
    const classified = groups.flat();
    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual([...ALL_CODES].sort());
  });

  it("counts a territory toward its sovereign, which is one of the 195", () => {
    expect(countryFor("HK")).toBe("CN");
    expect(countryFor("MO")).toBe("CN");
    expect(countryFor("PR")).toBe("US");
    expect(countryFor("GU")).toBe("US");
    expect(countryFor("GF")).toBe("FR");
    expect(countryFor("RE")).toBe("FR");
    expect(countryFor("GL")).toBe("DK");
    expect(countryFor("CW")).toBe("NL");
    const states = new Set([...UN_MEMBERS, ...OBSERVERS]);
    for (const sovereign of Object.values(TERRITORIES)) expect(states).toContain(sovereign);
  });

  it("counts disputed and partially recognized places as themselves", () => {
    expect(countryFor("TW")).toBe("TW");
    expect(countryFor("XK")).toBe("XK");
    expect(countryFor("EH")).toBe("EH");
  });

  it("counts Antarctica, a missing code, and an unknown code toward nothing", () => {
    expect(countryFor("AQ")).toBeNull();
    expect(countryFor(null)).toBeNull();
    expect(countryFor("")).toBeNull();
    expect(countryFor("ZZ")).toBeNull();
  });
});

describe("continentFor", () => {
  it("puts every ISO code (and XK) on exactly one of the 7 continents", () => {
    expect(CONTINENTS).toHaveLength(7);
    expect(Object.keys(CONTINENT_OF).sort()).toEqual([...ALL_CODES].sort());
    for (const code of ALL_CODES) expect(CONTINENTS).toContain(continentFor(code));
  });

  it("follows the UN geoscheme for transcontinental countries", () => {
    expect(continentFor("RU")).toBe("Europe");
    expect(continentFor("TR")).toBe("Asia");
    expect(continentFor("CY")).toBe("Asia");
    expect(continentFor("GE")).toBe("Asia");
    expect(continentFor("AM")).toBe("Asia");
    expect(continentFor("AZ")).toBe("Asia");
    expect(continentFor("KZ")).toBe("Asia");
    expect(continentFor("EG")).toBe("Africa");
  });

  it("counts Central America and the Caribbean as North America", () => {
    expect(continentFor("US")).toBe("North America");
    expect(continentFor("PA")).toBe("North America");
    expect(continentFor("CU")).toBe("North America");
    expect(continentFor("TT")).toBe("North America");
  });

  it("puts a territory on the continent it's on, not its sovereign's", () => {
    expect(continentFor("GF")).toBe("South America");
    expect(continentFor("RE")).toBe("Africa");
    expect(continentFor("PR")).toBe("North America");
    expect(continentFor("GU")).toBe("Oceania");
    expect(continentFor("GL")).toBe("North America");
    expect(continentFor("HK")).toBe("Asia");
    expect(continentFor("FK")).toBe("South America");
  });

  it("knows the disputed places and Antarctica", () => {
    expect(continentFor("TW")).toBe("Asia");
    expect(continentFor("XK")).toBe("Europe");
    expect(continentFor("EH")).toBe("Africa");
    expect(continentFor("AQ")).toBe("Antarctica");
  });

  it("gives a missing or unknown code no continent", () => {
    expect(continentFor(null)).toBeNull();
    expect(continentFor("ZZ")).toBeNull();
  });
});
