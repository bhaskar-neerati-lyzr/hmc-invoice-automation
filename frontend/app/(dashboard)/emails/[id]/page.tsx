"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "../../../lib/auth";
import {
  InvoiceDetail,
  ProcessingEvent,
  ProcessingEventOutcome,
  downloadAttachment,
  fetchInvoiceDetail,
  fetchProcessingEvents,
} from "../../../lib/outlookInvoices";

const NO_DATA = "No data available";

// Mirrors backend/outlook/processor.py's DEAD_LETTER_RETRY_THRESHOLD - a
// failed email at or past this many retries has been moved to the
// dead-letter table, worth a direct link to go check.
const DEAD_LETTER_RETRY_THRESHOLD = 5;

function formatDate(value: string | null): string {
  if (!value) return NO_DATA;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatStage(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function EventOutcomeDot({ outcome }: { outcome: ProcessingEventOutcome }) {
  const colors: Record<ProcessingEventOutcome, string> = {
    success: "bg-green-500",
    failed: "bg-red-500",
    skipped: "bg-zinc-400",
    info: "bg-amber-500",
  };
  return <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${colors[outcome]}`} />;
}

function ProcessingLog({ events }: { events: ProcessingEvent[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (events.length === 0) {
    return <p className="italic text-zinc-400 dark:text-zinc-500">No processing history recorded yet.</p>;
  }

  // Grouped by attempt so a retried email's history reads as separate
  // passes rather than one long undifferentiated list.
  const groups: { attempt: number; events: ProcessingEvent[] }[] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    if (last && last.attempt === e.attempt) last.events.push(e);
    else groups.push({ attempt: e.attempt, events: [e] });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.attempt}>
          {groups.length > 1 && (
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Attempt {group.attempt}
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {group.events.map((e) => {
              const expanded = expandedId === e.id;
              const hasDetail = !!e.detail && Object.keys(e.detail).length > 0;
              return (
                <li
                  key={e.id}
                  className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <button
                    type="button"
                    onClick={() => hasDetail && setExpandedId(expanded ? null : e.id)}
                    className={
                      "flex w-full items-start gap-2.5 px-3 py-2 text-left " +
                      (hasDetail ? "cursor-pointer" : "cursor-default")
                    }
                  >
                    <EventOutcomeDot outcome={e.outcome} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                          {formatStage(e.stage)}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                          {formatDate(e.created_at)}
                        </span>
                      </div>
                      {e.message && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{e.message}</p>}
                    </div>
                    {hasDetail && (
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                      >
                        <path d="M5 7l5 6 5-6" />
                      </svg>
                    )}
                  </button>
                  {expanded && hasDetail && (
                    <pre className="mx-3 mb-3 max-h-64 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">
                      {JSON.stringify(e.detail, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function EmailDetailPage() {
  const params = useParams<{ id: string }>();
  const { authFetch } = useAuth();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");

  const [tab, setTab] = useState<"details" | "log">("details");
  const [events, setEvents] = useState<ProcessingEvent[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");

  useEffect(() => {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: validate route param on mount
      setError("Invalid email id.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchInvoiceDetail(authFetch, id)
      .then((data) => setDetail(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Loaded lazily, only once the Processing Log tab is actually opened.
  useEffect(() => {
    if (tab !== "log" || events !== null) return;
    const id = Number(params.id);
    if (!Number.isFinite(id)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fetch-on-tab-open
    setEventsLoading(true);
    setEventsError("");
    fetchProcessingEvents(authFetch, id)
      .then((data) => setEvents(data.items))
      .catch((err) => setEventsError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setEventsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, params.id]);

  async function handleDownload(attachmentId: number, filename: string) {
    if (!detail) return;
    setDownloadError("");
    try {
      await downloadAttachment(authFetch, detail.id, attachmentId, filename);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to download attachment.");
    }
  }

  const isDeadLettered = detail?.status === "failed" && detail.retry_count >= DEAD_LETTER_RETRY_THRESHOLD;

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <main className="flex w-full max-w-3xl flex-col gap-6">
        <Link
          href="/"
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Emails
        </Link>

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
                {detail.retry_count > 0 && (
                  <div>
                    <span className="text-zinc-400 dark:text-zinc-500">Retries: </span>
                    {detail.retry_count}
                  </div>
                )}
                {detail.processing_duration_ms != null && (
                  <div>
                    <span className="text-zinc-400 dark:text-zinc-500">Processed in: </span>
                    {formatDuration(detail.processing_duration_ms)}
                    {detail.invoice?.ocr_duration_ms != null && (
                      <span className="text-zinc-400 dark:text-zinc-500">
                        {" "}
                        (OCR: {formatDuration(detail.invoice.ocr_duration_ms)})
                      </span>
                    )}
                  </div>
                )}
                {isDeadLettered && (
                  <Link
                    href="/dead-letter"
                    className="inline-flex w-fit items-center gap-1 text-sm font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Dead-lettered after {detail.retry_count} attempts - view in Dead Letter →
                  </Link>
                )}
              </div>
            </div>

            <div className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
              {(["details", "log"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  aria-pressed={tab === t}
                  className={
                    "rounded-md px-3 py-1 text-sm font-medium transition-colors " +
                    (tab === t
                      ? "bg-primary text-primary-foreground"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800")
                  }
                >
                  {t === "details" ? "Details" : "Processing Log"}
                </button>
              ))}
            </div>

            {tab === "details" && (
              <>
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
                  {downloadError && (
                    <p className="mb-2 text-xs text-red-600 dark:text-red-400">{downloadError}</p>
                  )}
                  {detail.attachments.length === 0 ? (
                    <p className="italic text-zinc-400 dark:text-zinc-500">None recorded</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {detail.attachments.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-zinc-700 dark:text-zinc-200">
                            {a.has_content ? (
                              <button
                                type="button"
                                onClick={() => handleDownload(a.id, a.filename)}
                                className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                {a.filename}
                              </button>
                            ) : (
                              a.filename
                            )}{" "}
                            <span className="text-zinc-400 dark:text-zinc-500">({a.content_type})</span>
                          </span>
                          {a.forwarded ? (
                            <span className="text-green-600 dark:text-green-400">sent to OCR - Lyzr Agent</span>
                          ) : (
                            <span className="text-zinc-400 dark:text-zinc-500">
                              not sent to OCR - Lyzr Agent, reason: {a.skip_reason}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {tab === "log" && (
              <div>
                {eventsLoading && <p className="text-center text-sm text-zinc-400 dark:text-zinc-500">Loading…</p>}
                {eventsError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {eventsError}
                  </div>
                )}
                {events && !eventsLoading && <ProcessingLog events={events} />}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
