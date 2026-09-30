import { z } from "zod";

import { errorResponse, isLoggedIn, readBody } from "@/lib/api";
import { isTimeZone } from "@/lib/dates";
import { ResolveError, resolveText } from "@/lib/resolve";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(500),
  timeZone: z.string().refine(isTimeZone),
});

// Type Location (SPEC §11.3). timeZone is the browser's IANA zone, for relative dates.
export async function POST(request: Request) {
  if (!(await isLoggedIn())) return errorResponse("unauthorized");

  const body = await readBody(request, bodySchema);
  if (!body) return errorResponse("invalid_input");

  try {
    return Response.json(await resolveText(body.text, body.timeZone));
  } catch (error) {
    if (error instanceof ResolveError) return errorResponse(error.code);
    console.error("resolve/text failed:", error);
    return errorResponse("upstream_error");
  }
}
