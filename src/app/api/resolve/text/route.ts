import { z } from "zod";

import { errorResponse, readBody, session } from "@/lib/api";
import { isTimeZone } from "@/lib/dates";
import { googleCallGate, limitLookup, RateLimitError } from "@/lib/rate-limit";
import { ResolveError, resolveText } from "@/lib/resolve";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(500),
  timeZone: z.string().refine(isTimeZone),
});

// Type Location (SPEC §11.3). timeZone is the browser's IANA zone, for relative dates.
export async function POST(request: Request) {
  const { userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  const body = await readBody(request, bodySchema);
  if (!body) return errorResponse("invalid_input");

  try {
    const admin = createAdminClient();
    await limitLookup(admin, userId, "text");
    return Response.json(await resolveText(body.text, body.timeZone, googleCallGate(admin, userId)));
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse("rate_limited");
    if (error instanceof ResolveError) return errorResponse(error.code);
    console.error("resolve/text failed:", error);
    return errorResponse("upstream_error");
  }
}
