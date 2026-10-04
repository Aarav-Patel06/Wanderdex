import { errorResponse, readBody, session } from "@/lib/api";
import { googleCallGate, limitLookup, RateLimitError } from "@/lib/rate-limit";
import { nearbyBodySchema, ResolveError, resolveNearby } from "@/lib/resolve";
import { createAdminClient } from "@/lib/supabase/admin";

// Upload Photo (SPEC §11.2 step 4): places near a photo's GPS coordinates. Only the coordinates
// come here; the photo itself never leaves the browser.
export async function POST(request: Request) {
  const { userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  const body = await readBody(request, nearbyBodySchema);
  if (!body) return errorResponse("invalid_input");

  try {
    const admin = createAdminClient();
    await limitLookup(admin, userId, "nearby");
    return Response.json(await resolveNearby(body, googleCallGate(admin, userId)));
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse("rate_limited");
    if (error instanceof ResolveError) return errorResponse(error.code);
    console.error("resolve/nearby failed:", error);
    return errorResponse("upstream_error");
  }
}
