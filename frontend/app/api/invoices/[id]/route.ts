import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeader, backendUrl } from "@/app/lib/backendClient";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(backendUrl(`/api/invoices/${id}`), {
    headers: { Authorization: backendAuthHeader() },
    cache: "no-store",
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
