import { errorResponse, readBody, session } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { importBodySchema, readVisitPlaces, resolveImport } from "@/lib/trip/lookup";

// Trip Photos (SPEC §11.8 step 5): places for every stop of an import, in one request. Only each
// stop's coordinates and local date come here; the photos never leave the browser. It isn't held
// to the per-user lookup limits (SPEC §17): Google lookups count toward the import allowance and
// the monthly caps instead.
export async function POST(request: Request) {
  const { supabase, userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  const body = await readBody(request, importBodySchema);
  if (!body) return errorResponse("invalid_input");

  try {
    const rows = await readVisitPlaces(supabase);
    return Response.json(await resolveImport(body, rows, { admin: createAdminClient(), userId }));
  } catch (error) {
    console.error("resolve/import failed:", error);
    return errorResponse("upstream_error");
  }
}
