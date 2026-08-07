"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { InvoiceDetail, attachmentDownloadUrl, fetchInvoiceDetail } from "../../../lib/outlookInvoices";

const NO_DATA = "No data available";

function formatDate(value: string | null): string {
  if (!value) return NO_DATA;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default function EmailDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: validate route param on mount
      setError("Invalid email id.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchInvoiceDetail(id)
      .then((data) => setDetail(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setLoading(false));
  }, [params.id]);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <main className="flex w-full max-w-3xl flex-col gap-6">
        <a
          href="/outlook-invoices"
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Outlook Invoices
        </a>

        {loading && <p className="text-center text-sm text-zinc-400 dark:text-zinc-500">Loading…</p>}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {detail && (
          <>
            <div>
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                {detail.subject || <span className="italic text-zinc-400 dark:text-zinc-500">{NO_DATA}</span>}
              </h1>
              <div className="mt-2 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300">
                <div>
                  <span className="text-zinc-400 dark:text-zinc-500">From: </span>
                  {detail.sender_name || detail.sender_email ? (
                    <>
                      {detail.sender_name}{" "}
                      {detail.sender_email && (
                        <span className="text-zinc-400 dark:text-zinc-500">&lt;{detail.sender_email}&gt;</span>
                      )}
                    </>
                  ) : (
                    <span className="italic text-zinc-400 dark:text-zinc-500">{NO_DATA}</span>
                  )}
                </div>
                <div>
                  <span className="text-zinc-400 dark:text-zinc-500">Received: </span>
                  {formatDate(detail.received_at)}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Body
              </div>
              {!detail.body ? (
                <p className="italic text-zinc-400 dark:text-zinc-500">No body content</p>
              ) : detail.body_content_type?.toLowerCase() === "html" ? (
                // Empty `sandbox` = maximum restriction: renders the markup/styling
                // but disables script execution, forms, popups, top-nav - required
                // because this HTML comes verbatim from whoever emailed the watched
                // mailbox (i.e. untrusted, third-party content), not from us.
                <iframe
                  sandbox=""
                  srcDoc={detail.body}
                  title="Email body"
                  className="h-[500px] w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800"
                />
              ) : (
                <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                  {detail.body}
                </pre>
              )}
            </div>

            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Attachments
              </div>
              {detail.attachments.length === 0 ? (
                <p className="italic text-zinc-400 dark:text-zinc-500">None recorded</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {detail.attachments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
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
          </>
        )}
      </main>
    </div>
  );
}
