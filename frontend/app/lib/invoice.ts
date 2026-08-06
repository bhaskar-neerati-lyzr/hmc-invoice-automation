export type InvoiceItem = {
  item_name: string;
  qty: string;
  unit_price: string;
  total_price: string;
};

export type OcrResult = {
  text: string;
  partial: boolean | null;
  message: string | null;
  is_invoice: boolean;
  vendor_name: string;
  vendor_address: string;
  vendor_zipcode: string;
  billing_address: string;
  billing_zipcode: string;
  service_address: string;
  service_zipcode: string;
  invoice_date: string;
  invoice_number: string;
  purchase_order_number: string;
  due_date: string;
  property_code: string;
  items: InvoiceItem[];
  sub_total: string;
  tax: string;
  total: string;
};

export function resultFromApi(data: Record<string, unknown>): OcrResult {
  const items = Array.isArray(data.items)
    ? (data.items as Record<string, unknown>[]).map((item) => ({
        item_name: typeof item.item_name === "string" ? item.item_name : "",
        qty: typeof item.qty === "string" ? item.qty : "",
        unit_price: typeof item.unit_price === "string" ? item.unit_price : "",
        total_price: typeof item.total_price === "string" ? item.total_price : "",
      }))
    : [];

  const str = (value: unknown) => (typeof value === "string" ? value : "");

  return {
    text: str(data.text),
    partial: typeof data.partial === "boolean" ? data.partial : null,
    message: typeof data.message === "string" && data.message ? data.message : null,
    is_invoice: Boolean(data.is_invoice),
    vendor_name: str(data.vendor_name),
    vendor_address: str(data.vendor_address),
    vendor_zipcode: str(data.vendor_zipcode),
    billing_address: str(data.billing_address),
    billing_zipcode: str(data.billing_zipcode),
    service_address: str(data.service_address),
    service_zipcode: str(data.service_zipcode),
    invoice_date: str(data.invoice_date),
    invoice_number: str(data.invoice_number),
    purchase_order_number: str(data.purchase_order_number),
    due_date: str(data.due_date),
    property_code: str(data.property_code),
    items,
    sub_total: str(data.sub_total),
    tax: str(data.tax),
    total: str(data.total),
  };
}

const NO_DATA = "No data available";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function toMarkdown(result: OcrResult): string {
  if (!result.is_invoice) {
    return result.message?.trim() || result.text || "Not an invoice";
  }

  const lines: string[] = [
    `**Vendor:** ${result.vendor_name || NO_DATA}`,
    `**Vendor Address:** ${result.vendor_address || NO_DATA}`,
    `**Vendor Zip Code:** ${result.vendor_zipcode || NO_DATA}`,
    `**Invoice #:** ${result.invoice_number || NO_DATA}`,
    `**PO #:** ${result.purchase_order_number || NO_DATA}`,
    "",
  ];

  const meta = [
    { label: "Billing Address", value: result.billing_address },
    { label: "Billing Zip Code", value: result.billing_zipcode },
    { label: "Service Address", value: result.service_address },
    { label: "Service Zip Code", value: result.service_zipcode },
    { label: "Invoice Date", value: result.invoice_date },
    { label: "Due Date", value: result.due_date },
    { label: "Property Code", value: result.property_code },
  ];
  for (const { label, value } of meta) {
    lines.push(`**${label}:** ${value || NO_DATA}`);
  }
  lines.push("");

  lines.push("| Item | Qty | Unit Price | Total |");
  lines.push("|---|---|---|---|");
  if (result.items.length === 0) {
    lines.push("| No items found | | | |");
  } else {
    for (const item of result.items) {
      lines.push(
        `| ${escapeCell(item.item_name) || "N/A"} | ${escapeCell(item.qty) || "N/A"} | ${escapeCell(item.unit_price) || "N/A"} | ${escapeCell(item.total_price) || "N/A"} |`
      );
    }
  }
  lines.push("");

  const totals = [
    { label: "Subtotal", value: result.sub_total },
    { label: "Tax", value: result.tax },
    { label: "Total", value: result.total },
  ];
  for (const { label, value } of totals) {
    lines.push(`**${label}:** ${value || NO_DATA}`);
  }

  if (result.message) {
    lines.push("", `_${result.message}_`);
  }

  return lines.join("\n").trim();
}
