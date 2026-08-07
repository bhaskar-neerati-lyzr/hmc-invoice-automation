"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import { InvoiceFilters, StatsResponse, fetchStats } from "../lib/outlookInvoices";

// Palette per the dataviz skill's reference instance (references/palette.md) -
// status colors are fixed/never themed; categorical slots 1 (blue) + 2
// (orange) are the pre-validated adjacent pair used here. Scoped as CSS
// custom properties on .viz-root, redefined under prefers-color-scheme:
// dark - same reactive-to-OS-theme pattern the rest of this app's Tailwind
// `dark:` classes already use, no JS theme toggle needed.
const VIZ_STYLES = `
.viz-root {
  --surface-1: #fcfcfb;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --text-muted: #898781;
  --gridline: #e1e0d9;
  --baseline: #c3c2b7;
  --status-good: #0ca30c;
  --status-warning: #fab219;
  --status-critical: #d03b3b;
  --status-neutral: #898781;
  --series-1: #2a78d6;
  --series-2: #eb6834;
}
@media (prefers-color-scheme: dark) {
  .viz-root {
    --surface-1: #1a1a19;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --gridline: #2c2c2a;
    --baseline: #383835;
    --status-good: #0ca30c;
    --status-warning: #fab219;
    --status-critical: #d03b3b;
    --status-neutral: #898781;
    --series-1: #3987e5;
    --series-2: #d95926;
  }
}
`;

const tickStyle = { fill: "var(--text-muted)", fontSize: 12 };

function formatCount(n: number): string {
  return n.toLocaleString();
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function pct(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</span>
      {sub && <span className="text-xs text-zinc-400 dark:text-zinc-500">{sub}</span>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="viz-root flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <style>{VIZ_STYLES}</style>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{title}</div>
      {children}
    </div>
  );
}

// Values lead (bold, primary ink), series name follows (secondary ink) - the
// legend's hierarchy inverted, since here the reader already has the series
// and wants the number. A short line-key stands in for a filled swatch.
function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: TooltipContentProps & { valueFormatter?: (v: number) => string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
      {label && <div className="mb-1 font-medium text-zinc-500 dark:text-zinc-400">{label}</div>}
      <div className="flex flex-col gap-0.5">
        {payload.map((entry) => (
          <div key={entry.dataKey as string} className="flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">
              {valueFormatter ? valueFormatter(Number(entry.value)) : String(entry.value)}
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatsPanel({ filters }: { filters: Pick<InvoiceFilters, "dateFrom" | "dateTo"> }) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fetch-on-mount/filter-change
    setLoading(true);
    setError("");
    fetchStats(filters)
      .then((data) => setStats(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setLoading(false));
  }, [filters.dateFrom, filters.dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !stats) {
    return <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">Loading stats…</p>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {error}
      </div>
    );
  }
  if (!stats) return null;

  // The two skip-reason sub-statuses read as one "skipped" segment here -
  // daily volume is about throughput/health at a glance, not skip triage
  // (that's what the skip-reasons chart below is for).
  const dailyForChart = stats.daily.map((d) => ({
    date: d.date.slice(5), // MM-DD - the year rarely adds anything at this range
    pending: d.pending,
    processed: d.processed,
    skipped: d.skipped_no_attachments + d.skipped_bad_attachment,
    failed: d.failed,
  }));

  const latencyForChart = stats.daily.map((d) => ({
    date: d.date.slice(5),
    "Processing (s)": d.avg_processing_ms != null ? Math.round(d.avg_processing_ms) / 1000 : null,
    "OCR (s)": d.avg_ocr_ms != null ? Math.round(d.avg_ocr_ms) / 1000 : null,
  }));

  const topSendersForChart = [...stats.top_senders].reverse(); // Recharts vertical bars render bottom-up
  const skipReasonsForChart = [...stats.skip_reasons].reverse();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Total emails" value={formatCount(stats.total)} />
        <StatTile
          label="Processed"
          value={pct(stats.by_status.processed, stats.total)}
          sub={`${formatCount(stats.by_status.processed)} of ${formatCount(stats.total)} · ${formatCount(
            stats.invoice_split.is_invoice
          )} invoices`}
        />
        <StatTile
          label="Failed"
          value={pct(stats.by_status.failed, stats.total)}
          sub={`${formatCount(stats.by_status.failed)} of ${formatCount(stats.total)}`}
        />
        <StatTile label="Currently pending" value={formatCount(stats.by_status.pending)} sub="claimed, not yet resolved" />
        <StatTile
          label="Avg processing time"
          value={formatMs(stats.latency.processing_ms.avg)}
          sub={`p95: ${formatMs(stats.latency.processing_ms.p95)}`}
        />
        <StatTile
          label="Avg OCR time"
          value={formatMs(stats.latency.ocr_ms.avg)}
          sub={`p95: ${formatMs(stats.latency.ocr_ms.p95)}`}
        />
      </div>

      <ChartCard title="Emails per day">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dailyForChart} barCategoryGap={4} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--gridline)" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} />
            <YAxis tick={tickStyle} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
            <Tooltip content={(props) => <ChartTooltip {...props} />} cursor={{ fill: "var(--gridline)", opacity: 0.4 }} />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
            <Bar dataKey="pending" name="Pending" stackId="status" fill="var(--status-neutral)" maxBarSize={24} />
            <Bar dataKey="processed" name="Processed" stackId="status" fill="var(--status-good)" maxBarSize={24} />
            <Bar dataKey="skipped" name="Skipped" stackId="status" fill="var(--status-warning)" maxBarSize={24} />
            <Bar
              dataKey="failed"
              name="Failed"
              stackId="status"
              fill="var(--status-critical)"
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Processing latency over time (daily avg)">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={latencyForChart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--gridline)" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} />
            <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={40} unit="s" />
            <Tooltip content={(props) => <ChartTooltip {...props} valueFormatter={(v) => `${v.toFixed(1)}s`} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
            <Line
              type="monotone"
              dataKey="Processing (s)"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--surface-1)", strokeWidth: 2 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="OCR (s)"
              stroke="var(--series-2)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--series-2)", stroke: "var(--surface-1)", strokeWidth: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Top senders">
          {topSendersForChart.length === 0 ? (
            <p className="py-8 text-center text-sm italic text-zinc-400 dark:text-zinc-500">No data in range</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(120, topSendersForChart.length * 32)}>
              <BarChart
                data={topSendersForChart}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--gridline)" strokeDasharray="0" horizontal={false} />
                <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="sender"
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={160}
                />
                <Tooltip content={(props) => <ChartTooltip {...props} />} cursor={{ fill: "var(--gridline)", opacity: 0.4 }} />
                <Bar dataKey="count" name="Emails" fill="var(--series-1)" maxBarSize={20} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Attachment skip reasons">
          {skipReasonsForChart.length === 0 ? (
            <p className="py-8 text-center text-sm italic text-zinc-400 dark:text-zinc-500">
              Nothing skipped in range
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(120, skipReasonsForChart.length * 32)}>
              <BarChart
                data={skipReasonsForChart}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--gridline)" strokeDasharray="0" horizontal={false} />
                <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="reason"
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={160}
                />
                <Tooltip content={(props) => <ChartTooltip {...props} />} cursor={{ fill: "var(--gridline)", opacity: 0.4 }} />
                <Bar dataKey="count" name="Attachments" fill="var(--series-2)" maxBarSize={20} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
