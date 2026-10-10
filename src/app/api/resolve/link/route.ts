import { z } from "zod";

import { errorResponse, readBody, session } from "@/lib/api";
import { cachedNearby } from "@/lib/nearby-cache";
import { googleCallGate, limitLookup, RateLimitError } from "@/lib/rate-limit";
import { ResolveError, resolveLink } from "@/lib/resolve";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ url: z.string().trim().min(1).max(2048) });

// Paste Link (SPEC §11.1). Errors carry the parsed name (or null) for Type Location. A link with
// only coordinates searches nearby, through the shared lookup cache (SPEC §17).
export async function POST(request: Request) {
  const { userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  const body = await readBody(request, bodySchema);
  if (!body) return errorResponse("invalid_input");

  try {
    const admin = createAdminClient();
    await limitLookup(admin, userId, "link");
    const gate = googleCallGate(admin, userId);
    return Response.json(await resolveLink(body.url, gate, cachedNearby(admin, gate)));
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse("rate_limited", { name: null });
    if (error instanceof ResolveError) return errorResponse(error.code, { name: error.parsedName });
    console.error("resolve/link failed:", error);
    return errorResponse("upstream_error", { name: null });
  }
}
