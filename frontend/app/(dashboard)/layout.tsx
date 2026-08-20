"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { changePassword } from "../lib/account";

const NAV_LINKS = [
  { href: "/", label: "Emails" },
  { href: "/kpis", label: "KPIs" },
  { href: "/dead-letter", label: "Dead Letter" },
];

function DashboardNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <nav className="flex items-center justify-between gap-3 bg-sidebar px-4 py-2 text-sidebar-foreground">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center bg-primary text-xs font-bold text-primary-foreground">
            IO
          </span>
          <span className="text-sm font-semibold tracking-tight">InvoiceOps</span>
        </div>
        <div className="flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            // The Emails tab (href "/") also covers its own detail route,
            // /emails/[id] - not just an exact match on "/".
            const active =
              link.href === "/" ? pathname === "/" || pathname.startsWith("/emails/") : pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  "px-3 py-1.5 text-sm font-medium transition-colors " +
                  (active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground")
                }
              >
                {link.label}
              </Link>
            );
          })}
          {user?.role === "admin" && (
            <Link
              href="/users"
              className={
                "px-3 py-1.5 text-sm font-medium transition-colors " +
                (pathname === "/users"
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground")
              }
            >
              Users
            </Link>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/account"
          className={
            "flex items-center gap-1.5 text-sidebar-foreground/80 hover:text-sidebar-foreground " +
            (pathname === "/account" ? "font-semibold text-sidebar-foreground" : "")
          }
        >
          {user?.email}
          {user?.role && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              {user.role}
            </span>
          )}
        </Link>
        <button
          onClick={handleLogout}
          className="text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

function ForcePasswordReset({ onDone }: { onDone: () => void }) {
  const { authFetch } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(authFetch, { current_password: current, new_password: next });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="text-center">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Set a new password</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            You must set your own password before continuing.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">Temporary password</span>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">New password</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">Confirm new password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
        </label>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Set password"}
        </button>
      </form>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshAccount } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, pathname, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">Loading…</p>
      </div>
    );
  }

  if (!user) return null; // redirect effect above is about to fire

  if (user.must_reset_password) {
    return <ForcePasswordReset onDone={refreshAccount} />;
  }

  if (user.role !== "admin" && pathname === "/users") {
    router.replace("/");
    return null;
  }

  return (
    <div className="flex flex-1 flex-col">
      <DashboardNav />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
