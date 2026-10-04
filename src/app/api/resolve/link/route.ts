import { z } from "zod";

import { errorResponse, readBody, session } from "@/lib/api";
import { googleCallGate, limitLookup, RateLimitError } from "@/lib/rate-limit";
import { ResolveError, resolveLink } from "@/lib/resolve";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ url: z.string().trim().min(1).max(2048) });

// Paste Link (SPEC §11.1). Errors carry the parsed name (or null) for Type Location.
export async function POST(request: Request) {
  const { userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  const body = await readBody(request, bodySchema);
  if (!body) return errorResponse("invalid_input");

  try {
    const admin = createAdminClient();
    await limitLookup(admin, userId, "link");
    return Response.json(await resolveLink(body.url, googleCallGate(admin, userId)));
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse("rate_limited", { name: null });
    if (error instanceof ResolveError) return errorResponse(error.code, { name: error.parsedName });
    console.error("resolve/link failed:", error);
    return errorResponse("upstream_error", { name: null });
  }
}
