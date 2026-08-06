import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeader, backendUrl } from "@/app/lib/backendClient";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { id, attachmentId } = await params;
  const res = await fetch(backendUrl(`/api/invoices/${id}/attachments/${attachmentId}`), {
    headers: { Authorization: backendAuthHeader() },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    return new NextResponse(errorBody, { status: res.status });
  }

  const bytes = await res.arrayBuffer();
  return new NextResponse(bytes, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": res.headers.get("content-disposition") || "attachment",
    },
  });
}
