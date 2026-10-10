import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { deleteAccount, deleteAccountSchema, usernameMatches } from "@/lib/account";
import { fakeSupabase } from "@/test/fake-supabase";

describe("usernameMatches", () => {
  it("matches the username, ignoring case and surrounding spaces", () => {
    expect(usernameMatches("aarav", "aarav")).toBe(true);
    expect(usernameMatches("Aarav", "aarav")).toBe(true);
    expect(usernameMatches(" aarav ", "aarav")).toBe(true);
  });

  it("doesn't match anything else", () => {
    expect(usernameMatches("", "aarav")).toBe(false);
    expect(usernameMatches("aara", "aarav")).toBe(false);
    expect(usernameMatches("aarav_", "aarav")).toBe(false);
    expect(usernameMatches("a arav", "aarav")).toBe(false);
  });

  it("never matches a missing username", () => {
    expect(usernameMatches("", "")).toBe(false);
  });
});

describe("deleteAccountSchema", () => {
  it("takes the typed username and nothing else", () => {
    expect(deleteAccountSchema.safeParse({ username: "aarav" }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ username: "aarav", userId: "someone-else" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ username: "x".repeat(101) }).success).toBe(false);
  });
});

// A client that records each step it's asked to run, and can fail one.
function recordingAdmin({ fail }: { fail?: "visits" | "places" | "auth" | "auth-404" } = {}) {
  const steps: string[] = [];
  const from = (table: string) => {
    const step = [`delete ${table}`];
    const query = {
      delete: () => query,
      eq: (column: string, value: string) => (step.push(`${column} = ${value}`), query),
      is: (column: string, value: null) => (step.push(`${column} is ${value}`), query),
      then: (resolve: (value: unknown) => unknown) => {
        steps.push(step.join(", "));
        return Promise.resolve({ error: fail === table ? { message: "boom" } : null }).then(resolve);
      },
    };
    return query;
  };
  const deleteUser = async (id: string) => {
    steps.push(`delete auth user ${id}`);
    if (fail === "auth") return { error: { status: 500, message: "Database error deleting user" } };
    if (fail === "auth-404") return { error: { status: 404, message: "User not found" } };
    return { error: null };
  };
  return { steps, client: { from, auth: { admin: { deleteUser } } } as unknown as SupabaseClient };
}

describe("deleteAccount", () => {
  it("deletes the visits, then the private manual places, then the auth user", async () => {
    const admin = recordingAdmin();
    await deleteAccount(admin.client, "user-1");
    expect(admin.steps).toEqual([
      "delete visits, user_id = user-1",
      "delete places, created_by = user-1, google_place_id is null",
      "delete auth user user-1",
    ]);
  });

  it("stops at the first failure, so nothing later runs and a retry starts over", async () => {
    const visits = recordingAdmin({ fail: "visits" });
    await expect(deleteAccount(visits.client, "user-1")).rejects.toBeTruthy();
    expect(visits.steps).toEqual(["delete visits, user_id = user-1"]);

    const places = recordingAdmin({ fail: "places" });
    await expect(deleteAccount(places.client, "user-1")).rejects.toBeTruthy();
    expect(places.steps).toHaveLength(2);

    const auth = recordingAdmin({ fail: "auth" });
    await expect(deleteAccount(auth.client, "user-1")).rejects.toMatchObject({ status: 500 });
  });

  it("counts an auth user that's already gone as deleted", async () => {
    await expect(deleteAccount(recordingAdmin({ fail: "auth-404" }).client, "user-1")).resolves.toBeUndefined();
  });

  it("keeps shared Google places and everyone else's rows", async () => {
    const db = fakeSupabase({
      visits: [
        { id: "v1", user_id: "user-1", place_id: "google-1" },
        { id: "v2", user_id: "user-1", place_id: "pin-1" },
        { id: "v3", user_id: "user-2", place_id: "google-1" },
      ],
      places: [
        { id: "google-1", google_place_id: "ChIJ1", created_by: null },
        // A Google place the user's save happened to create stays shared.
        { id: "google-2", google_place_id: "ChIJ2", created_by: "user-1" },
        { id: "pin-1", google_place_id: null, created_by: "user-1" },
        { id: "pin-2", google_place_id: null, created_by: "user-2" },
      ],
    });
    const deleted: string[] = [];
    const client = Object.assign(db.client, {
      auth: { admin: { deleteUser: async (id: string) => (deleted.push(id), { error: null }) } },
    });

    await deleteAccount(client, "user-1");
    expect(db.tables.visits.map((row) => row.id)).toEqual(["v3"]);
    expect(db.tables.places.map((row) => row.id)).toEqual(["google-1", "google-2", "pin-2"]);
    expect(deleted).toEqual(["user-1"]);
  });
});
