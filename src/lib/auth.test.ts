import { describe, expect, it } from "vitest";

import { signupSchema, usernameSchema, usernameToEmail } from "@/lib/auth";

describe("usernameSchema", () => {
  it.each(["abc", "aarav_p", "user_123", "___", "a".repeat(20)])("accepts %s", (name) => {
    expect(usernameSchema.parse(name)).toBe(name);
  });

  it("lowercases", () => {
    expect(usernameSchema.parse("Aarav_P")).toBe("aarav_p");
    expect(usernameSchema.parse("ABC")).toBe("abc");
  });

  it("trims surrounding spaces", () => {
    expect(usernameSchema.parse("  aarav ")).toBe("aarav");
  });

  it.each([
    ["too short", "ab"],
    ["too long", "a".repeat(21)],
    ["empty", ""],
    ["space inside", "aa rav"],
    ["hyphen", "aa-rav"],
    ["dot", "aa.rav"],
    ["at sign", "aarav@x"],
    ["accented letter", "josé"],
    ["emoji", "abc😀"],
  ])("rejects %s", (_, name) => {
    expect(usernameSchema.safeParse(name).success).toBe(false);
  });

  it("checks length after trimming", () => {
    expect(usernameSchema.safeParse(" ab ").success).toBe(false);
  });
});

describe("signupSchema", () => {
  const valid = { username: "aarav", password: "secret", confirmPassword: "secret" };

  it("accepts matching passwords of 6+ characters with no other rules", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects passwords under 6 characters", () => {
    const result = signupSchema.safeParse({ ...valid, password: "12345", confirmPassword: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects a mismatched confirmation on the confirm field", () => {
    const result = signupSchema.safeParse({ ...valid, confirmPassword: "secreT" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["confirmPassword"]);
  });
});

describe("usernameToEmail", () => {
  it("builds the placeholder email", () => {
    expect(usernameToEmail("aarav")).toBe("aarav@wanderdex.local");
  });
});
