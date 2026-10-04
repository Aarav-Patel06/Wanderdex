import { errorResponse, isLoggedIn, readBody } from "@/lib/api";
import { nearbyBodySchema, ResolveError, resolveNearby } from "@/lib/resolve";

// Upload Photo (SPEC §11.2 step 4): places near a photo's GPS coordinates. Only the coordinates
// come here; the photo itself never leaves the browser.
export async function POST(request: Request) {
  if (!(await isLoggedIn())) return errorResponse("unauthorized");

  const body = await readBody(request, nearbyBodySchema);
  if (!body) return errorResponse("invalid_input");

  try {
    return Response.json(await resolveNearby(body));
  } catch (error) {
    if (error instanceof ResolveError) return errorResponse(error.code);
    console.error("resolve/nearby failed:", error);
    return errorResponse("upstream_error");
  }
}
