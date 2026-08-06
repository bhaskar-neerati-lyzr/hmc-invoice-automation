"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  InvoiceDetail,
  InvoiceFilters,
  InvoiceStatus,
  InvoiceSummary,
  attachmentDownloadUrl,
  fetchInvoiceDetail,
  fetchInvoices,
} from "../lib/outlookInvoices";

const NO_DATA = "No data available";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "processed", label: "Processed" },
  { value: "pending", label: "Pending" },
  { value: "skipped_no_attachments", label: "Skipped (no attachment)" },
  { value: "skipped_bad_attachment", label: "Skipped (bad attachment)" },
  { value: "failed", label: "Failed" },
];

const EMPTY_FILTERS: InvoiceFilters = {
  status: "",
  dateFrom: "",
  dateTo: "",
  sender: "",
  vendor: "",
  invoiceNumber: "",
  purchaseOrderNumber: "",
};

// The date range (dateFrom + dateTo) is one filter conceptually, even
// though it's two separate InvoiceFilters keys - counted/removed as a unit
// everywhere a user sees "how many filters are active" or clears one.
type FilterChipKey = "status" | "sender" | "vendor" | "invoiceNumber" | "purchaseOrderNumber" | "dateRange";

function formatDateLabel(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function filterChips(filters: InvoiceFilters): { key: FilterChipKey; label: string }[] {
  const chips: { key: FilterChipKey; label: string }[] = [];
  if (filters.status) {
    const match = STATUS_FILTERS.find((f) => f.value === filters.status);
    chips.push({ key: "status", label: `Status: ${match?.label ?? filters.status}` });
  }
  if (filters.sender) chips.push({ key: "sender", label: `Sender: ${filters.sender}` });
  if (filters.vendor) chips.push({ key: "vendor", label: `Vendor: ${filters.vendor}` });
  if (filters.invoiceNumber) chips.push({ key: "invoiceNumber", label: `Invoice #: ${filters.invoiceNumber}` });
  if (filters.purchaseOrderNumber) chips.push({ key: "purchaseOrderNumber", label: `PO #: ${filters.purchaseOrderNumber}` });
  if (filters.dateFrom || filters.dateTo) {
    const from = formatDateLabel(filters.dateFrom || "") || "any";
    const to = formatDateLabel(filters.dateTo || "") || "any";
    chips.push({ key: "dateRange", label: `Received: ${from} – ${to}` });
  }
  return chips;
}

function activeFilterCount(filters: InvoiceFilters): number {
  return filterChips(filters).length;
}

function withoutFilter(filters: InvoiceFilters, key: FilterChipKey): InvoiceFilters {
  if (key === "dateRange") return { ...filters, dateFrom: "", dateTo: "" };
  return { ...filters, [key]: "" };
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

const filterInputClass =
  "rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";

function DateRangeField({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (next: { dateFrom: string; dateTo: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    dateFrom || dateTo
      ? `${formatDateLabel(dateFrom) || "any"} – ${formatDateLabel(dateTo) || "any"}`
      : "Any date";

  return (
    <div className="relative flex flex-col gap-1 text-xs">
      <span className="font-medium text-zinc-500 dark:text-zinc-400">Received</span>
      <button type="button" onClick={() => setOpen((o) => !o)} className={filterInputClass + " text-left"}>
        {summary}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-10 mt-1 flex gap-2 rounded-lg border border-zinc-300 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onChange({ dateFrom: e.target.value, dateTo })}
              className={filterInputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onChange({ dateFrom, dateTo: e.target.value })}
              className={filterInputClass}
            />
          </label>
        </div>
      )}
    </div>
  );
}

type BadgeColor = "green" | "amber" | "gray" | "red";

function StatusBadge({ status, isInvoice }: { status: InvoiceStatus; isInvoice: boolean | null }) {
  const styles: Record<BadgeColor, string> = {
    green: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    gray: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  };
  const dots: Record<BadgeColor, string> = {
    green: "bg-green-500",
    amber: "bg-amber-500",
    gray: "bg-zinc-400",
    red: "bg-red-500",
  };

  let color: BadgeColor = "gray";
  let label: string = status;
  if (status === "pending") {
    color = "amber";
    label = "Processing";
  } else if (status === "failed") {
    color = "red";
    label = "Failed";
  } else if (status === "processed") {
    color = isInvoice ? "green" : "gray";
    label = isInvoice ? "Invoice" : "Not an invoice";
  } else if (status.startsWith("skipped")) {
    color = "gray";
    label = "Skipped";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${styles[color]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[color]}`} />
      {label}
    </span>
  );
}

function formatDate(value: string | null): string {
  if (!value) return NO_DATA;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function Cell({ value }: { value: string | null }) {
  return value ? (
    <span className="text-zinc-800 dark:text-zinc-100">{value}</span>
  ) : (
    <span className="italic text-zinc-400 dark:text-zinc-500">{NO_DATA}</span>
  );
}

// Compact placeholder for empty table cells in the list view - "No data
// available" reads fine in the detail panel but is too noisy repeated
// across many rows in a dense table.
function CompactCell({ value }: { value: string | null }) {
  return value ? (
    <span className="text-zinc-800 dark:text-zinc-100">{value}</span>
  ) : (
    <span className="text-zinc-300 dark:text-zinc-600">–</span>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-4 text-sm">
      <span className="w-40 shrink-0 text-zinc-500 dark:text-zinc-400">{label}</span>
      <Cell value={value} />
    </div>
  );
}

function InvoiceDetailPanel({ detail }: { detail: InvoiceDetail }) {
  const invoice = detail.invoice;

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
      {detail.error_message && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {detail.error_message}
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Attachments
        </div>
        {detail.attachments.length === 0 ? (
          <p className="italic text-zinc-400 dark:text-zinc-500">None recorded</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {detail.attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-700 dark:text-zinc-200">
                  {a.has_content ? (
                    <a
                      href={attachmentDownloadUrl(detail.id, a.id)}
                      className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {a.filename}
                    </a>
                  ) : (
                    a.filename
                  )}{" "}
                  <span className="text-zinc-400 dark:text-zinc-500">({a.content_type})</span>
                </span>
                {a.forwarded ? (
                  <span className="text-green-600 dark:text-green-400">forwarded</span>
                ) : (
                  <span className="text-zinc-400 dark:text-zinc-500">skipped — {a.skip_reason}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {invoice && (
        <>
          {/* Block A: vendor + the two identifiers that matter most */}
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Vendor
              </div>
              <div
                className={
                  invoice.vendor_name
                    ? "text-base font-semibold text-zinc-900 dark:text-zinc-50"
                    : "text-sm italic text-zinc-400 dark:text-zinc-500"
                }
              >
                {invoice.vendor_name || NO_DATA}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <DetailRow label="Vendor Address" value={invoice.vendor_address} />
              <DetailRow label="Vendor Zip" value={invoice.vendor_zipcode} />
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Invoice #
                </div>
                <div
                  className={
                    invoice.invoice_number
                      ? "text-base font-semibold text-zinc-900 dark:text-zinc-50"
                      : "text-sm italic text-zinc-400 dark:text-zinc-500"
                  }
                >
                  {invoice.invoice_number || NO_DATA}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  PO #
                </div>
                <div
                  className={
                    invoice.purchase_order_number
                      ? "text-base font-semibold text-zinc-900 dark:text-zinc-50"
                      : "text-sm italic text-zinc-400 dark:text-zinc-500"
                  }
                >
                  {invoice.purchase_order_number || NO_DATA}
                </div>
              </div>
            </div>
          </div>

          {/* Block B: secondary details */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <DetailRow label="Billing Address" value={invoice.billing_address} />
            <DetailRow label="Billing Zip" value={invoice.billing_zipcode} />
            <DetailRow label="Service Address" value={invoice.service_address} />
            <DetailRow label="Service Zip" value={invoice.service_zipcode} />
            <DetailRow label="Invoice Date" value={invoice.invoice_date} />
            <DetailRow label="Due Date" value={invoice.due_date} />
            <DetailRow label="Property Code" value={invoice.property_code} />
          </div>

          {/* Block C: line items - the one section meant to actually look like a table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-700">
                  <th className="py-1.5 pr-2 font-medium">Item</th>
                  <th className="py-1.5 px-2 text-right font-medium">Qty</th>
                  <th className="py-1.5 px-2 text-right font-medium">Unit Price</th>
                  <th className="py-1.5 pl-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-center italic text-zinc-400 dark:text-zinc-500">
                      No items found
                    </td>
                  </tr>
                ) : (
                  invoice.line_items.map((item, i) => (
                    <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                      <td className="py-1.5 pr-2"><Cell value={item.item_name} /></td>
                      <td className="py-1.5 px-2 text-right"><Cell value={item.qty} /></td>
                      <td className="py-1.5 px-2 text-right"><Cell value={item.unit_price} /></td>
                      <td className="py-1.5 pl-2 text-right"><Cell value={item.total_price} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="ml-auto flex w-full max-w-[220px] flex-col gap-1">
            <DetailRow label="Subtotal" value={invoice.sub_total} />
            <DetailRow label="Tax" value={invoice.tax} />
            <DetailRow label="Total" value={invoice.total} />
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100">
              Raw response
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-zinc-900 p-3 text-zinc-100">
              {JSON.stringify(invoice.raw_response, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}

export default function OutlookInvoicesPage() {
  const router = useRouter();
  const [items, setItems] = useState<InvoiceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [appliedFilters, setAppliedFilters] = useState<InvoiceFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<InvoiceFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load(filters: InvoiceFilters) {
    setLoading(true);
    setError("");
    try {
      const data = await fetchInvoices(filters);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fetch-on-mount/filter-change
    load(appliedFilters);
  }, [appliedFilters]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setAppliedFilters(draftFilters);
    setShowFilters(false);
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setShowFilters(false);
  }

  function removeFilter(key: FilterChipKey) {
    const next = withoutFilter(appliedFilters, key);
    setDraftFilters(next);
    setAppliedFilters(next);
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  async function toggleRow(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const data = await fetchInvoiceDetail(id);
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <main className="flex w-full max-w-7xl flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Outlook Invoices</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Emails automatically ingested from the watched mailbox and run through OCR.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Filters
              {activeFilterCount(appliedFilters) > 0 && (
                <span className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900">
                  {activeFilterCount(appliedFilters)}
                </span>
              )}
            </button>
            {activeFilterCount(appliedFilters) > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">{total} total</span>
            <button
              onClick={() => load(appliedFilters)}
              disabled={loading}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={handleLogout}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Log out
            </button>
          </div>
        </div>

        {activeFilterCount(appliedFilters) > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {filterChips(appliedFilters).map((chip) => (
              <span
                key={chip.key}
                className="flex items-center gap-1.5 rounded-full bg-zinc-100 py-1 pl-3 pr-2 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={() => removeFilter(chip.key)}
                  aria-label={`Remove filter: ${chip.label}`}
                  className="rounded-full px-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {showFilters && (
          <form
            onSubmit={applyFilters}
            className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-3 md:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <FilterField label="Status">
              <select
                value={draftFilters.status}
                onChange={(e) => setDraftFilters((f) => ({ ...f, status: e.target.value }))}
                className={filterInputClass}
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Sender (name or email)">
              <input
                type="text"
                value={draftFilters.sender}
                onChange={(e) => setDraftFilters((f) => ({ ...f, sender: e.target.value }))}
                placeholder="e.g. billing@vendor.com"
                className={filterInputClass}
              />
            </FilterField>

            <FilterField label="Vendor">
              <input
                type="text"
                value={draftFilters.vendor}
                onChange={(e) => setDraftFilters((f) => ({ ...f, vendor: e.target.value }))}
                placeholder="e.g. Acme Supplies"
                className={filterInputClass}
              />
            </FilterField>

            <FilterField label="Invoice #">
              <input
                type="text"
                value={draftFilters.invoiceNumber}
                onChange={(e) => setDraftFilters((f) => ({ ...f, invoiceNumber: e.target.value }))}
                className={filterInputClass}
              />
            </FilterField>

            <FilterField label="PO #">
              <input
                type="text"
                value={draftFilters.purchaseOrderNumber}
                onChange={(e) => setDraftFilters((f) => ({ ...f, purchaseOrderNumber: e.target.value }))}
                className={filterInputClass}
              />
            </FilterField>

            <DateRangeField
              dateFrom={draftFilters.dateFrom ?? ""}
              dateTo={draftFilters.dateTo ?? ""}
              onChange={({ dateFrom, dateTo }) => setDraftFilters((f) => ({ ...f, dateFrom, dateTo }))}
            />

            <div className="col-span-full flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setDraftFilters(appliedFilters);
                  setShowFilters(false);
                }}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Apply filters
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-700">
                <th className="px-3 py-2 font-medium">Received</th>
                <th className="px-3 py-2 font-medium">Sender</th>
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium">Invoice #</th>
                <th className="px-3 py-2 font-medium">PO #</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm italic text-zinc-400 dark:text-zinc-500">
                    No invoices processed yet — send a test email to the mailbox.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <Fragment key={item.id}>
                  <tr
                    onClick={() => toggleRow(item.id)}
                    className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                      {formatDate(item.received_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Cell value={item.sender_email} />
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2">
                      <Cell value={item.subject} />
                    </td>
                    <td className="px-3 py-2">
                      <Cell value={item.vendor_name} />
                    </td>
                    <td className="px-3 py-2">
                      <Cell value={item.invoice_number} />
                    </td>
                    <td className="px-3 py-2">
                      <CompactCell value={item.purchase_order_number} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Cell value={item.total} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={item.status} isInvoice={item.is_invoice} />
                    </td>
                  </tr>
                  {expandedId === item.id && (
                    <tr key={`${item.id}-detail`}>
                      <td colSpan={8} className="px-3 pb-4">
                        {detailLoading ? (
                          <p className="py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">Loading…</p>
                        ) : detail ? (
                          <InvoiceDetailPanel detail={detail} />
                        ) : (
                          <p className="py-4 text-center text-sm text-red-500">Failed to load details.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
