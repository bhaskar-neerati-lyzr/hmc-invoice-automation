"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth";
import { KpisResponse, fetchKpis } from "../../lib/outlookInvoices";

type PresetKey = "7d" | "30d" | "month" | "all";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeForPreset(preset: PresetKey): { from: string; to: string } {
  const now = new Date();
  const to = toISODate(now);
  if (preset === "all") return { from: "", to: "" };
  if (preset === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISODate(first), to };
  }
  const days = preset === "7d" ? 7 : 30;
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from: toISODate(from), to };
}

type CardDef = {
  key: keyof KpisResponse;
  label: string;
  statusParam?: string; // query value for the dashboard's status filter
};

const CARDS: CardDef[] = [
  { key: "total", label: "Total emails" },
  { key: "pending", label: "Pending", statusParam: "pending" },
  { key: "processed", label: "Processed", statusParam: "processed" },
  { key: "failed", label: "Failed", statusParam: "failed" },
  { key: "skipped_no_attachments", label: "Skipped (no attachments)", statusParam: "skipped_no_attachments" },
  { key: "skipped_bad_attachment", label: "Skipped (bad attachment)", statusParam: "skipped_bad_attachment" },
  { key: "dead_lettered", label: "Dead-lettered" },
];

export default function KpisPage() {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [preset, setPreset] = useState<PresetKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [kpis, setKpis] = useState<KpisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { from, to } = useCustom ? { from: customFrom, to: customTo } : rangeForPreset(preset);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fetch-on-mount/range-change
    setLoading(true);
    setError("");
    fetchKpis(authFetch, { receivedFrom: from || undefined, receivedTo: to || undefined })
      .then((data) => setKpis(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  function goFiltered(statusParam?: string) {
    const params = new URLSearchParams();
    if (statusParam) params.set("status", statusParam);
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <main className="flex w-full max-w-5xl flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">KPIs</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Independent of the dashboard&apos;s own filters — pick a date range and click a card to jump to the
            matching filtered list.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                setUseCustom(false);
                setPreset(p.key);
              }}
              aria-pressed={!useCustom && preset === p.key}
              className={
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
                (!useCustom && preset === p.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800")
              }
            >
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => {
                setUseCustom(true);
                setCustomFrom(e.target.value);
              }}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            />
            <span className="text-zinc-400">–</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => {
                setUseCustom(true);
                setCustomTo(e.target.value);
              }}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {loading && !kpis && <p className="text-center text-sm text-zinc-400 dark:text-zinc-500">Loading…</p>}

        {kpis && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {CARDS.map((card) => {
              const value = kpis[card.key];
              const pctOfTotal = kpis.total > 0 ? Math.round((value / kpis.total) * 100) : 0;
              const clickable = card.key !== "total";
              return (
                <button
                  key={card.key}
                  type="button"
                  disabled={!clickable}
                  onClick={() => (card.key === "dead_lettered" ? router.push("/dead-letter") : goFiltered(card.statusParam))}
                  className={
                    "flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 text-left dark:border-zinc-800 dark:bg-zinc-900 " +
                    (clickable ? "cursor-pointer transition-colors hover:border-zinc-400 dark:hover:border-zinc-600" : "")
                  }
                >
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{card.label}</span>
                  <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value.toLocaleString()}</span>
                  {clickable && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pctOfTotal}%` }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
