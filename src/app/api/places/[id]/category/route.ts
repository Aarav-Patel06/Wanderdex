import { errorResponse, readBody, session } from "@/lib/api";
import { categoryChangeSchema, idSchema } from "@/lib/visits";

// The user's category for a place (SPEC §8, §14.4). places is shared, so this changes only the
// user's own visits there, all of them, so their pin uses it. The user's session client: RLS
// limits the update to their rows (SPEC §9). No visits there → not_found.
export async function PATCH(request: Request, ctx: RouteContext<"/api/places/[id]/category">) {
  const { supabase, userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  const id = idSchema.safeParse((await ctx.params).id);
  const body = await readBody(request, categoryChangeSchema);
  if (!id.success || !body) return errorResponse("invalid_input");

  try {
    const { data, error } = await supabase
      .from("visits")
      .update({ category: body.category })
      .eq("user_id", userId)
      .eq("place_id", id.data)
      .select("id");
    if (error) throw error;
    if (!data.length) return errorResponse("not_found");
    return Response.json({ updated: data.length });
  } catch (error) {
    console.error("category change failed:", error);
    return errorResponse("upstream_error");
  }
}
