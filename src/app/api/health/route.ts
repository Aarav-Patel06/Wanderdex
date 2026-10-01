import { healthTokenMatches } from "@/lib/health";
import { createAdminClient } from "@/lib/supabase/admin";

// Keep-alive target (SPEC §18): the GitHub Actions ping calls this every ~3 days so the free
// Supabase project doesn't pause. Authenticated by HEALTH_PING_TOKEN, not a session (src/proxy.ts
// lets /api/* through). Answers only {"ok": …}: no data, no error details.
export async function GET(request: Request) {
  if (!healthTokenMatches(request.headers.get("authorization"), process.env.HEALTH_PING_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // A trivial query that touches the database. The admin client, since the tightened grants
    // give the publishable key nothing. `head` returns no rows.
    const { error } = await createAdminClient()
      .from("places")
      .select("id", { head: true })
      .limit(1);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("health check failed:", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
