"use client";

import { useState } from "react";
import { OcrResult, toMarkdown } from "../lib/invoice";

const NO_DATA = "No data available";

type BadgeColor = "green" | "amber" | "gray";

function Badge({ label, color }: { label: string; color: BadgeColor }) {
  const styles: Record<BadgeColor, string> = {
    green: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    gray: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  };
  const dots: Record<BadgeColor, string> = {
    green: "bg-green-500",
    amber: "bg-amber-500",
    gray: "bg-zinc-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${styles[color]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[color]}`} />
      {label}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 text-sm">
      <span className="w-40 shrink-0 text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={value ? "text-zinc-800 dark:text-zinc-100" : "italic text-zinc-400 dark:text-zinc-500"}>
        {value || NO_DATA}
      </span>
    </div>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      className={
        "flex justify-between text-sm " +
        (bold
          ? "border-t border-zinc-200 pt-1 font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          : "text-zinc-600 dark:text-zinc-300")
      }
    >
      <span>{label}</span>
      <span className={value ? "" : "italic text-zinc-400 dark:text-zinc-500"}>{value || NO_DATA}</span>
    </div>
  );
}

export default function InvoiceResult({ result }: { result: OcrResult }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(toMarkdown(result));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const badge = !result.is_invoice ? (
    <Badge label="Not an invoice" color="gray" />
  ) : result.partial === null ? null : result.partial ? (
    <Badge label="Partial" color="amber" />
  ) : (
    <Badge label="Complete" color="green" />
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {result.is_invoice ? "Invoice" : "Extracted text"}
          </span>
          {badge}
        </div>
        <button
          onClick={handleCopy}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {!result.is_invoice ? (
        <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-100">
          {result.message || result.text || "No text found."}
        </p>
      ) : (
        <>
          {result.message && (
            <p className="mb-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {result.message}
            </p>
          )}

          <div className="flex flex-col gap-4">
            {/* Block A: vendor + the two identifiers that matter most */}
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Vendor
                </div>
                <div
                  className={
                    result.vendor_name
                      ? "text-base font-semibold text-zinc-900 dark:text-zinc-50"
                      : "text-sm italic text-zinc-400 dark:text-zinc-500"
                  }
                >
                  {result.vendor_name || NO_DATA}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <MetaRow label="Vendor Address" value={result.vendor_address} />
                <MetaRow label="Vendor Zip Code" value={result.vendor_zipcode} />
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-lg bg-white p-3 dark:bg-zinc-900">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Invoice #
                  </div>
                  <div
                    className={
                      result.invoice_number
                        ? "text-base font-semibold text-zinc-900 dark:text-zinc-50"
                        : "text-sm italic text-zinc-400 dark:text-zinc-500"
                    }
                  >
                    {result.invoice_number || NO_DATA}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    PO #
                  </div>
                  <div
                    className={
                      result.purchase_order_number
                        ? "text-base font-semibold text-zinc-900 dark:text-zinc-50"
                        : "text-sm italic text-zinc-400 dark:text-zinc-500"
                    }
                  >
                    {result.purchase_order_number || NO_DATA}
                  </div>
                </div>
              </div>
            </div>

            {/* Block B: secondary details */}
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              <MetaRow label="Billing Address" value={result.billing_address} />
              <MetaRow label="Billing Zip Code" value={result.billing_zipcode} />
              <MetaRow label="Service Address" value={result.service_address} />
              <MetaRow label="Service Zip Code" value={result.service_zipcode} />
              <MetaRow label="Invoice Date" value={result.invoice_date} />
              <MetaRow label="Due Date" value={result.due_date} />
              <MetaRow label="Property Code" value={result.property_code} />
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
                  {result.items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-3 text-center italic text-zinc-400 dark:text-zinc-500">
                        No items found
                      </td>
                    </tr>
                  ) : (
                    result.items.map((item, i) => (
                      <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                        <td className="py-1.5 pr-2 text-zinc-800 dark:text-zinc-100">{item.item_name || "N/A"}</td>
                        <td className="py-1.5 px-2 text-right text-zinc-600 dark:text-zinc-300">{item.qty || "N/A"}</td>
                        <td className="py-1.5 px-2 text-right text-zinc-600 dark:text-zinc-300">{item.unit_price || "N/A"}</td>
                        <td className="py-1.5 pl-2 text-right text-zinc-800 dark:text-zinc-100">{item.total_price || "N/A"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="ml-auto flex w-full max-w-[220px] flex-col gap-1">
              <TotalRow label="Subtotal" value={result.sub_total} />
              <TotalRow label="Tax" value={result.tax} />
              <TotalRow label="Total" value={result.total} bold />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
