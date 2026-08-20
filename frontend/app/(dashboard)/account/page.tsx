"use client";

import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { changePassword } from "../../lib/account";

export default function AccountPage() {
  const { authFetch, user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
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
      setSuccess(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <main className="flex w-full max-w-md flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Account</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{user?.email}</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-1 text-sm">
            <div>
              <span className="text-zinc-400 dark:text-zinc-500">Email: </span>
              <span className="text-zinc-800 dark:text-zinc-100">{user?.email}</span>
            </div>
            <div>
              <span className="text-zinc-400 dark:text-zinc-500">Role: </span>
              <span className="text-zinc-800 dark:text-zinc-100">{user?.role}</span>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Change password</h2>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">Current password</span>
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
            {mismatch && <span className="text-xs text-red-600 dark:text-red-400">Passwords do not match.</span>}
          </label>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
              Password updated.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Update password"}
          </button>
        </form>
      </main>
    </div>
  );
}
