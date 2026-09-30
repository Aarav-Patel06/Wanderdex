import { z } from "zod";

import { errorResponse, isLoggedIn, readBody } from "@/lib/api";
import { ResolveError, resolveLink } from "@/lib/resolve";

const bodySchema = z.object({ url: z.string().trim().min(1).max(2048) });

// Paste Link (SPEC §11.1). Errors carry the parsed name (or null) for Type Location.
export async function POST(request: Request) {
  if (!(await isLoggedIn())) return errorResponse("unauthorized");

  const body = await readBody(request, bodySchema);
  if (!body) return errorResponse("invalid_input");

  try {
    return Response.json(await resolveLink(body.url));
  } catch (error) {
    if (error instanceof ResolveError) return errorResponse(error.code, { name: error.parsedName });
    console.error("resolve/link failed:", error);
    return errorResponse("upstream_error", { name: null });
  }
}
