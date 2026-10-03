import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const AUTH_PAGES = ["/login", "/signup"];

// Runs before every page request (Next 16's replacement for middleware).
// Refreshes the Supabase session cookie and applies the SPEC §10 redirects.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Verifies the JWT (and refreshes it if expired). Don't run code between
  // createServerClient and this call.
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const onAuthPage = AUTH_PAGES.includes(request.nextUrl.pathname);

  // API routes check the session themselves and answer with a JSON error, not a redirect.
  if (request.nextUrl.pathname.startsWith("/api/")) return response;
  if (!loggedIn && !onAuthPage) return redirect(request, response, "/login");
  if (loggedIn && onAuthPage) return redirect(request, response, "/");
  return response;
}

// Redirect while keeping any refreshed session cookies.
function redirect(request: NextRequest, from: NextResponse, path: string) {
  const to = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

export const config = {
  // Everything except Next's static files, images (sprites, favicon), and the country shapes.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|svg|ico|jpg|jpeg|gif|webp|geojson)$).*)"],
};
