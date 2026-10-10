import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "@/test/fake-supabase";

import { DELETE } from "./route";

// The real handler, with the session stubbed (it needs Next's request cookies). The session
// client and the admin client are one in-memory database; auth calls are recorded.
const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("@/test/fake-supabase").fakeSupabase>,
  userId: "user-1" as string | null,
  calls: [] as string[],
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  session: async () => ({ supabase: state.db.client, userId: state.userId }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db.client }));

beforeEach(() => {
  state.userId = "user-1";
  state.calls = [];
  state.db = fakeSupabase({
    profiles: [{ user_id: "user-1", username: "aarav" }],
    visits: [{ id: "v1", user_id: "user-1", place_id: "pin-1" }],
    places: [{ id: "pin-1", google_place_id: null, created_by: "user-1" }],
  });
  Object.assign(state.db.client, {
    auth: {
      admin: { deleteUser: async (id: string) => (state.calls.push(`deleteUser ${id}`), { error: null }) },
      signOut: async ({ scope }: { scope: string }) => (state.calls.push(`signOut ${scope}`), { error: null }),
    },
  });
});

const request = (body: unknown) =>
  new Request("http://localhost/api/account", { method: "DELETE", body: JSON.stringify(body) });

describe("DELETE /api/account", () => {
  it("deletes the account and signs this browser out when the username matches", async () => {
    const res = await DELETE(request({ username: " Aarav" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(state.db.tables.visits).toEqual([]);
    expect(state.db.tables.places).toEqual([]);
    expect(state.calls).toEqual(["deleteUser user-1", "signOut local"]);
  });

  it("deletes nothing when the username doesn't match", async () => {
    const res = await DELETE(request({ username: "someone" }));
    expect(res.status).toBe(400);
    expect(state.db.tables.visits).toHaveLength(1);
    expect(state.db.tables.places).toHaveLength(1);
    expect(state.calls).toEqual([]);
  });

  it("rejects a body that isn't just the username", async () => {
    expect((await DELETE(request({ username: "aarav", user_id: "user-2" }))).status).toBe(400);
    expect((await DELETE(new Request("http://localhost/api/account", { method: "DELETE", body: "nope" }))).status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("needs a session", async () => {
    state.userId = null;
    expect((await DELETE(request({ username: "aarav" }))).status).toBe(401);
    expect(state.db.tables.visits).toHaveLength(1);
  });
});
