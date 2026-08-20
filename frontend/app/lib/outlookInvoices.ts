export type InvoiceLineItem = {
  item_name: string | null;
  qty: string | null;
  unit_price: string | null;
  total_price: string | null;
};

export type AttachmentMeta = {
  id: number;
  filename: string;
  content_type: string;
  forwarded: boolean;
  skip_reason: string | null;
  has_content: boolean;
};

export type InvoiceStatus =
  | "pending"
  | "processed"
  | "skipped_no_attachments"
  | "skipped_bad_attachment"
  | "failed";

export type InvoiceSummary = {
  id: number;
  message_id: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  received_at: string | null;
  status: InvoiceStatus;
  error_message: string | null;
  retry_count: number;
  is_invoice: boolean | null;
  vendor_name: string | null;
  invoice_number: string | null;
  purchase_order_number: string | null;
  invoice_date: string | null;
  total: string | null;
  session_id: string | null;
};

export type InvoiceFields = {
  session_id: string | null;
  is_invoice: boolean;
  ocr_duration_ms: number | null;
  vendor_name: string | null;
  vendor_address: string | null;
  vendor_zipcode: string | null;
  billing_address: string | null;
  billing_zipcode: string | null;
  service_address: string | null;
  service_zipcode: string | null;
  invoice_date: string | null;
  invoice_number: string | null;
  purchase_order_number: string | null;
  due_date: string | null;
  property_code: string | null;
  sub_total: string | null;
  tax: string | null;
  total: string | null;
  raw_response: Record<string, unknown>;
  line_items: InvoiceLineItem[];
};

export type InvoiceDetail = {
  id: number;
  message_id: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  received_at: string | null;
  body: string | null;
  body_content_type: string | null;
  status: InvoiceStatus;
  error_message: string | null;
  processing_duration_ms: number | null;
  retry_count: number;
  attachments: AttachmentMeta[];
  invoice: InvoiceFields | null;
};

export type InvoiceFilters = {
  status?: string[];
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  sender?: string;
  vendor?: string;
  invoiceNumber?: string;
  purchaseOrderNumber?: string;
};

export type DailyStats = {
  date: string; // YYYY-MM-DD
  pending: number;
  processed: number;
  skipped_no_attachments: number;
  skipped_bad_attachment: number;
  failed: number;
  avg_processing_ms: number | null;
  avg_ocr_ms: number | null;
};

export type StatsResponse = {
  total: number;
  by_status: Record<InvoiceStatus, number>;
  invoice_split: { is_invoice: number; not_invoice: number };
  latency: {
    processing_ms: { avg: number | null; p95: number | null };
    ocr_ms: { avg: number | null; p95: number | null };
  };
  daily: DailyStats[];
  top_senders: { sender: string; count: number }[];
  skip_reasons: { reason: string; count: number }[];
};

export type KpisResponse = {
  total: number;
  pending: number;
  processed: number;
  failed: number;
  skipped_no_attachments: number;
  skipped_bad_attachment: number;
  dead_lettered: number;
};

export type DeadLetterEmail = {
  id: number;
  message_id: string;
  subject: string | null;
  last_error: string | null;
  retry_count: number;
  moved_at: string;
};

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

// All calls hit the FastAPI backend directly via authFetch (which prefixes
// NEXT_PUBLIC_API_BASE_URL and attaches the Bearer token) - there is no
// same-origin Next.js proxy layer anymore (see app/lib/auth.tsx).

export async function fetchInvoices(
  authFetch: AuthFetch,
  filters: InvoiceFilters = {}
): Promise<{ total: number; items: InvoiceSummary[] }> {
  const params = new URLSearchParams({ limit: "100" });
  for (const s of filters.status ?? []) params.append("status", s);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.sender) params.set("sender", filters.sender);
  if (filters.vendor) params.set("vendor", filters.vendor);
  if (filters.invoiceNumber) params.set("invoice_number", filters.invoiceNumber);
  if (filters.purchaseOrderNumber) params.set("purchase_order_number", filters.purchaseOrderNumber);

  const res = await authFetch(`/api/invoices?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load invoices.");
  return res.json();
}

export async function fetchInvoiceDetail(authFetch: AuthFetch, id: number): Promise<InvoiceDetail> {
  const res = await authFetch(`/api/invoices/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load invoice detail.");
  return res.json();
}

export async function fetchStats(
  authFetch: AuthFetch,
  filters: Pick<InvoiceFilters, "dateFrom" | "dateTo"> = {}
): Promise<StatsResponse> {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  const qs = params.toString();

  const res = await authFetch(`/api/invoices/stats${qs ? `?${qs}` : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load stats.");
  return res.json();
}

// Downloads via blob instead of a plain <a href>: a bare link navigation
// can't carry an Authorization header, so the browser would hit FastAPI
// with no Bearer token and get a 401. This fetches the bytes through
// authFetch (which does attach the header) and triggers a save client-side.
export async function downloadAttachment(authFetch: AuthFetch, emailId: number, attachmentId: number, filename: string) {
  const res = await authFetch(`/api/invoices/${emailId}/attachments/${attachmentId}`);
  if (!res.ok) throw new Error("Failed to download attachment.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchKpis(
  authFetch: AuthFetch,
  range: { receivedFrom?: string; receivedTo?: string } = {}
): Promise<KpisResponse> {
  const params = new URLSearchParams();
  if (range.receivedFrom) params.set("received_from", range.receivedFrom);
  if (range.receivedTo) params.set("received_to", range.receivedTo);
  const qs = params.toString();

  const res = await authFetch(`/api/kpis${qs ? `?${qs}` : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load KPIs.");
  return res.json();
}

export async function fetchDeadLetterEmails(
  authFetch: AuthFetch,
  params: { limit?: number } = {}
): Promise<{ data: DeadLetterEmail[]; meta: { total: number; limit: number; offset: number } }> {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 100) });
  const res = await authFetch(`/api/dead-letter-emails?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load dead-letter emails.");
  return res.json();
}
