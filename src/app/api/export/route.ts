import { errorResponse, session } from "@/lib/api";
import { EXPORT_SELECT, type ExportVisit, exportRow } from "@/lib/export";
import { readAllPages } from "@/lib/paging";

// Export data (SPEC §14.6): every one of the user's visits with its place, newest first, read
// under their session (RLS returns only their own, SPEC §9) a page at a time. The browser builds
// the CSV and JSON files from these rows.
export async function GET() {
  const { supabase, userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  try {
    const visits = await readAllPages((from, to) =>
      supabase
        .from("visits")
        .select(EXPORT_SELECT)
        // Ties by id, so pages neither overlap nor skip rows.
        .order("visited_at", { ascending: false })
        .order("id")
        .range(from, to)
        // Untyped client: it can't tell that `places` is many-to-one (one object, not an array).
        .overrideTypes<ExportVisit[], { merge: false }>(),
    );
    return Response.json({ visits: visits.map(exportRow) });
  } catch (error) {
    console.error("export failed:", error);
    return errorResponse("upstream_error");
  }
}
