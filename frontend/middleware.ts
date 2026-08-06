import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "@/app/lib/session";

// Gates both the /outlook-invoices page AND its /api/invoices/** data routes
// with a single session-cookie check, instead of the browser's native HTTP
// Basic Auth dialog. The backend (backend/outlook/invoices_router.py) is no
// longer reachable from the browser directly - every /api/invoices/** call
// here is itself a proxy that checked this cookie, then calls the backend
// server-to-server with its own Basic Auth credentials the browser never
// sees. One origin, one login - see learning-path/05 for the full design
// and why it replaced a two-origin Basic Auth setup.
export async function middleware(request: NextRequest) {
  const expectedUser = process.env.INVOICES_AUTH_USER;
  const expectedPassword = process.env.INVOICES_AUTH_PASSWORD;
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/invoices");

  if (!expectedUser || !expectedPassword) {
    const message = "Outlook Invoices auth is not configured (set INVOICES_AUTH_USER/INVOICES_AUTH_PASSWORD).";
    return isApiRequest
      ? NextResponse.json({ error: message }, { status: 500 })
      : new NextResponse(message, { status: 500 });
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await verifySessionCookieValue(cookie, expectedUser, expectedPassword);
  if (valid) return NextResponse.next();

  if (isApiRequest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/outlook-invoices/:path*", "/api/invoices/:path*"],
};
