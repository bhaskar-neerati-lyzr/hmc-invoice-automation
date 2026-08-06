import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, createSessionCookieValue, timingSafeEqual } from "@/app/lib/session";

export async function POST(request: NextRequest) {
  const expectedUser = process.env.INVOICES_AUTH_USER;
  const expectedPassword = process.env.INVOICES_AUTH_PASSWORD;
  if (!expectedUser || !expectedPassword) {
    return NextResponse.json(
      { error: "Outlook Invoices auth is not configured (set INVOICES_AUTH_USER/INVOICES_AUTH_PASSWORD)." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!timingSafeEqual(username, expectedUser) || !timingSafeEqual(password, expectedPassword)) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const cookieValue = await createSessionCookieValue(expectedUser, expectedPassword);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours - matches session.ts's own expiry check
  });
  return response;
}
