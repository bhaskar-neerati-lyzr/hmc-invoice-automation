import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeader, backendUrl } from "@/app/lib/backendClient";

// Auth is already enforced by middleware.ts (matcher includes /api/invoices/:path*)
// before this handler ever runs - this is a pure proxy to the backend.
export async function GET(request: NextRequest) {
  const res = await fetch(backendUrl(`/api/invoices/stats${request.nextUrl.search}`), {
    headers: { Authorization: backendAuthHeader() },
    cache: "no-store",
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
