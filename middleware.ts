import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

/**
 * Lightweight presence check only (Edge runtime can't run firebase-admin,
 * which needs Node.js APIs). This just keeps signed-out staff from ever
 * loading a dashboard page. The real authorization boundary is server-side:
 * every Server Component/Action calls requireCurrentUser(), which verifies
 * the cookie's signature/expiry via the Admin SDK and rejects it if invalid.
 */
export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/suppliers/:path*"],
};
