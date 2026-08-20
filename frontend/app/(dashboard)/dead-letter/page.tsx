"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { DeadLetterEmail, fetchDeadLetterEmails } from "../../lib/outlookInvoices";

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function ErrorCell({ error, id, expanded, onToggle }: { error: string | null; id: number; expanded: boolean; onToggle: () => void }) {
  if (!error) return <span className="text-zinc-300 dark:text-zinc-600">–</span>;
  const isLong = error.length > 90;
  return (
    <div className="max-w-md">
      <p className={expanded ? "whitespace-pre-wrap text-zinc-700 dark:text-zinc-200" : "line-clamp-2 text-zinc-700 dark:text-zinc-200"}>
        {error}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {expanded ? "less" : "more"}
        </button>
      )}
    </div>
  );
}

export default function DeadLetterPage() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState<DeadLetterEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fetch-on-mount
    setLoading(true);
    fetchDeadLetterEmails(authFetch, { limit: 100 })
      .then((res) => setRows(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <main className="flex w-full max-w-6xl flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Dead Letter</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Emails given up on after repeated processing failures.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-700">
                <th className="px-3 py-2 font-medium">Message ID</th>
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 text-right font-medium">Retries</th>
                <th className="px-3 py-2 font-medium">Moved at</th>
                <th className="px-3 py-2 font-medium">Last error</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm italic text-zinc-400 dark:text-zinc-500">
                    Nothing dead-lettered.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800">
                  <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-300">{row.message_id}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-zinc-800 dark:text-zinc-100">
                    {row.subject || <span className="italic text-zinc-400 dark:text-zinc-500">No subject</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-300">{row.retry_count}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-300">{formatDate(row.moved_at)}</td>
                  <td className="px-3 py-2 text-xs">
                    <ErrorCell
                      error={row.last_error}
                      id={row.id}
                      expanded={!!expanded[row.id]}
                      onToggle={() => setExpanded((e) => ({ ...e, [row.id]: !e[row.id] }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
