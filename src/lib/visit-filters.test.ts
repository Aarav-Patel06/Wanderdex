import { describe, expect, it } from "vitest";

import {
  categoriesFromChips,
  citiesIn,
  filterOptions,
  filtersSearch,
  hasFilters,
  NO_FILTERS,
  withCountry,
} from "@/lib/visit-filters";
import { filtersFromSearchParams, visitFiltersSchema } from "@/lib/visit-filters-schema";

describe("filtersFromSearchParams", () => {
  it("reads every filter", () => {
    expect(
      filtersFromSearchParams({
        category: "cafe,food",
        country: "Japan",
        city: "Tokyo",
        from: "2025-03-01",
        to: "2025-03-31",
      }),
    ).toEqual({ categories: ["food", "cafe"], country: "Japan", city: "Tokyo", from: "2025-03-01", to: "2025-03-31" });
  });

  it("reads the newer categories, in their fixed order", () => {
    expect(filtersFromSearchParams({ category: "other,city,airport,campus,sports,entertainment" }).categories).toEqual([
      "entertainment",
      "sports",
      "campus",
      "airport",
      "city",
      "other",
    ]);
  });

  it("is no filters for an empty query", () => {
    expect(filtersFromSearchParams({})).toEqual(NO_FILTERS);
  });

  it("leaves out what isn't valid", () => {
    expect(
      filtersFromSearchParams({
        category: "food,spa,,Food",
        country: "",
        city: "x".repeat(201),
        from: "2025-02-30",
        to: "2025-13-01",
      }),
    ).toEqual({ ...NO_FILTERS, categories: ["food"] });
    expect(filtersFromSearchParams({ from: "March 1", to: "2025-3-1" })).toEqual(NO_FILTERS);
  });

  it("takes the first of repeated params", () => {
    expect(filtersFromSearchParams({ country: ["Japan", "France"] }).country).toBe("Japan");
  });

  it("keeps city and country exactly as stored", () => {
    expect(filtersFromSearchParams({ city: "São Paulo, SP" }).city).toBe("São Paulo, SP");
  });
});

describe("filtersSearch", () => {
  it("is empty for no filters", () => {
    expect(filtersSearch(NO_FILTERS)).toBe("");
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });

  it("writes categories in their fixed order and encodes values", () => {
    const filters = { categories: ["cafe" as const, "food" as const], country: "Côte d'Ivoire", city: null, from: null, to: "2025-03-31" };
    expect(filtersSearch(filters)).toBe("category=food%2Ccafe&country=C%C3%B4te+d%27Ivoire&to=2025-03-31");
    expect(hasFilters(filters)).toBe(true);
  });

  it("round-trips through the URL", () => {
    const filters = { categories: ["bar" as const], country: "Japan", city: "Tokyo", from: "2025-01-01", to: null };
    const params = Object.fromEntries(new URLSearchParams(filtersSearch(filters)));
    expect(filtersFromSearchParams(params)).toEqual(filters);
  });
});

describe("visitFiltersSchema", () => {
  it("takes valid filters", () => {
    const filters = { categories: ["food"], country: "Japan", city: "Tokyo", from: "2024-02-29", to: null };
    expect(visitFiltersSchema.parse(filters)).toEqual(filters);
  });

  it("rejects unknown categories, empty names, and impossible days", () => {
    for (const bad of [
      { categories: ["spa"] },
      { country: "" },
      { city: 42 },
      { from: "2025-02-29" },
      { to: "2025-03-01T00:00" },
    ]) {
      expect(visitFiltersSchema.safeParse({ ...NO_FILTERS, ...bad }).success).toBe(false);
    }
  });
});

describe("categoriesFromChips", () => {
  it("adds a chip to the chosen ones", () => {
    expect(categoriesFromChips([], ["all", "cafe"])).toEqual(["cafe"]);
    expect(categoriesFromChips(["cafe"], ["cafe", "food"])).toEqual(["food", "cafe"]);
  });

  it("clears the categories when All is turned on", () => {
    expect(categoriesFromChips(["food", "bar"], ["food", "bar", "all"])).toEqual([]);
  });

  it("is All again when the last category is turned off, or All is tapped while on", () => {
    expect(categoriesFromChips(["food"], [])).toEqual([]);
    expect(categoriesFromChips([], [])).toEqual([]);
  });
});

describe("city and country options", () => {
  const options = filterOptions([
    { city: "Tokyo", country: "Japan" },
    { city: "Kyoto", country: "Japan" },
    { city: "Tokyo", country: "Japan" },
    { city: "Paris", country: "France" },
    { city: "London", country: "United Kingdom" },
    { city: "London", country: "Canada" },
    { city: null, country: "Iceland" },
    { city: "Atlantis", country: null },
  ]);

  it("lists each country once, sorted", () => {
    expect(options.countries).toEqual(["Canada", "France", "Iceland", "Japan", "United Kingdom"]);
  });

  it("lists every city without a country, once each", () => {
    expect(citiesIn(options, null)).toEqual(["Atlantis", "Kyoto", "London", "Paris", "Tokyo"]);
  });

  it("lists only the chosen country's cities", () => {
    expect(citiesIn(options, "Japan")).toEqual(["Kyoto", "Tokyo"]);
    expect(citiesIn(options, "Canada")).toEqual(["London"]);
    expect(citiesIn(options, "Iceland")).toEqual([]);
  });

  it("keeps the city when the new country has it, and clears it otherwise", () => {
    const tokyo = { ...NO_FILTERS, city: "Tokyo" };
    expect(withCountry(tokyo, "Japan", options)).toEqual({ ...tokyo, country: "Japan" });
    expect(withCountry(tokyo, "France", options)).toEqual({ ...NO_FILTERS, country: "France" });
    expect(withCountry({ ...tokyo, country: "Japan" }, null, options)).toEqual(tokyo);
  });
});
