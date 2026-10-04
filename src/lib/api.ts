import type { z } from "zod";

import { ERROR_STATUS, type ResolveErrorCode } from "@/lib/resolve";
import { createClient } from "@/lib/supabase/server";

// Helpers for route handlers (SPEC §17: every handler checks the session and
// validates its input with zod).

// The user's session client (RLS applies) and their user id, or null when logged out.
export async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub ?? null };
}

// The parsed JSON body, or null if it's not JSON or doesn't match the schema.
export async function readBody<T>(request: Request, schema: z.ZodType<T>) {
  try {
    const result = schema.safeParse(await request.json());
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function errorResponse(code: ResolveErrorCode, extra?: object) {
  return Response.json({ error: code, ...extra }, { status: ERROR_STATUS[code] });
}
