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
  attachments: AttachmentMeta[];
  invoice: InvoiceFields | null;
};

export type InvoiceFilters = {
  status?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  sender?: string;
  vendor?: string;
  invoiceNumber?: string;
  purchaseOrderNumber?: string;
};

// Deliberately same-origin, relative paths - NOT NEXT_PUBLIC_API_BASE_URL.
// These hit this Next.js server's own /api/invoices/** proxy routes
// (app/api/invoices/**), which forward to the FastAPI backend server-side.
// The browser never talks to the backend directly for this data, which is
// what keeps this to a single login (see middleware.ts + app/login).

export async function fetchInvoices(
  filters: InvoiceFilters = {}
): Promise<{ total: number; items: InvoiceSummary[] }> {
  const params = new URLSearchParams({ limit: "100" });
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.sender) params.set("sender", filters.sender);
  if (filters.vendor) params.set("vendor", filters.vendor);
  if (filters.invoiceNumber) params.set("invoice_number", filters.invoiceNumber);
  if (filters.purchaseOrderNumber) params.set("purchase_order_number", filters.purchaseOrderNumber);

  const res = await fetch(`/api/invoices?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load invoices.");
  return res.json();
}

export async function fetchInvoiceDetail(id: number): Promise<InvoiceDetail> {
  const res = await fetch(`/api/invoices/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load invoice detail.");
  return res.json();
}

export function attachmentDownloadUrl(emailId: number, attachmentId: number): string {
  return `/api/invoices/${emailId}/attachments/${attachmentId}`;
}
