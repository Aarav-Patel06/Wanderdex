import { errorResponse, readBody, session } from "@/lib/api";
import { visitedAtUtc } from "@/lib/dates";
import { idSchema, visitEditSchema, visitsAt } from "@/lib/visits";

// One visit, from the place detail page (SPEC §14.4). Both run under the user's session client,
// so RLS limits them to the user's own visits (SPEC §9); someone else's visit is not_found.

// Edits the date (at its precision), rating, and note. The date is read in the visit's stored
// zone (SPEC §8), the one it's shown in.
export async function PATCH(request: Request, ctx: RouteContext<"/api/visits/[id]">) {
  const { supabase, userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  const id = idSchema.safeParse((await ctx.params).id);
  const body = await readBody(request, visitEditSchema);
  if (!id.success || !body) return errorResponse("invalid_input");

  try {
    const { data: current, error } = await supabase
      .from("visits")
      .select("timezone")
      .eq("id", id.data)
      .maybeSingle<{ timezone: string }>();
    if (error) throw error;
    if (!current) return errorResponse("not_found");

    const { data: updated, error: updateError } = await supabase
      .from("visits")
      .update({
        visited_at: visitedAtUtc(body.visited.value, body.visited.precision, current.timezone).toISOString(),
        visited_precision: body.visited.precision,
        rating: body.rating,
        note: body.note,
      })
      .eq("id", id.data)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (updateError) throw updateError;
    if (!updated) return errorResponse("not_found");
    return Response.json({ id: updated.id });
  } catch (error) {
    console.error("visit edit failed:", error);
    return errorResponse("upstream_error");
  }
}

// Deletes the visit, never the place row (SPEC §8). `last` says it was the user's last visit
// there, so the page can go to My Visits.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/visits/[id]">) {
  const { supabase, userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("invalid_input");

  try {
    const { data: deleted, error } = await supabase
      .from("visits")
      .delete()
      .eq("id", id.data)
      .select("place_id")
      .maybeSingle<{ place_id: string }>();
    if (error) throw error;
    if (!deleted) return errorResponse("not_found");

    // The visit is already gone; if the count fails, the page refreshes and shows "not found"
    // when nothing is left.
    let last = false;
    try {
      last = (await visitsAt(supabase, { userId, placeId: deleted.place_id })) === 0;
    } catch (countError) {
      console.error("remaining-visits count failed:", countError);
    }
    return Response.json({ last });
  } catch (error) {
    console.error("visit delete failed:", error);
    return errorResponse("upstream_error");
  }
}
