"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { UserRow, createUser, fetchUsers, resetInvite, revokeUser } from "../../lib/account";
import type { Role } from "../../lib/auth";

function isInvited(row: UserRow): boolean {
  return row.must_reset_password !== false;
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
        (role === "admin"
          ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300")
      }
    >
      {role}
    </span>
  );
}

function StatusBadge({ invited }: { invited: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
        (invited
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300")
      }
    >
      {invited ? "Invited" : "Active"}
    </span>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {children}
      </div>
    </div>
  );
}

function CredentialsDialog({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${email} / ${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable - the values are still shown on screen
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Share these credentials</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        This password is shown once. Copy it now — it can be regenerated later, but not viewed again.
      </p>
      <div className="mt-4 flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
        <div>
          <span className="text-zinc-400 dark:text-zinc-500">Email: </span>
          <span className="font-mono text-zinc-900 dark:text-zinc-50">{email}</span>
        </div>
        <div>
          <span className="text-zinc-400 dark:text-zinc-500">Password: </span>
          <span className="font-mono text-zinc-900 dark:text-zinc-50">{password}</span>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Close
        </button>
        <button
          onClick={handleCopy}
          className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </Modal>
  );
}

function AddUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (row: UserRow & { generated_password: string }) => void }) {
  const { authFetch } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const created = await createUser(authFetch, { email, name: name || undefined, role });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Add user</h2>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
        </label>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RevokeDialog({ row, onClose, onRevoked }: { row: UserRow; onClose: () => void; onRevoked: () => void }) {
  const { authFetch } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError("");
    setSubmitting(true);
    try {
      await revokeUser(authFetch, row.id);
      onRevoked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Revoke invitation?</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        This permanently deletes the pending account for <span className="font-medium">{row.email}</span>.
      </p>
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Revoking…" : "Revoke"}
        </button>
      </div>
    </Modal>
  );
}

function RowMenu({ row, onCopyCredentials, onRevoke }: { row: UserRow; onCopyCredentials: () => void; onRevoke: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Row actions"
        className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <button
              onClick={() => {
                setOpen(false);
                onCopyCredentials();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Copy credentials
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onRevoke();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-zinc-800"
            >
              Revoke invitation
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function UsersPage() {
  const { authFetch, user: currentUser } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [revoking, setRevoking] = useState<UserRow | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchUsers(authFetch);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fetch-on-mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCopyCredentials(row: UserRow) {
    try {
      const result = await resetInvite(authFetch, row.id);
      setCredentials({ email: result.email, password: result.generated_password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate credentials.");
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <main className="flex w-full max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Users</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Manage who can sign in.</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add user
          </button>
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
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm italic text-zinc-400 dark:text-zinc-500">
                    No users yet.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const invited = isInvited(row);
                const isSelf = row.id === currentUser?.id;
                return (
                  <tr key={row.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-3 py-2 text-zinc-800 dark:text-zinc-100">{row.email}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{row.name || "–"}</td>
                    <td className="px-3 py-2">
                      <RoleBadge role={row.role} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge invited={invited} />
                    </td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      {invited && !isSelf && (
                        <RowMenu
                          row={row}
                          onCopyCredentials={() => handleCopyCredentials(row)}
                          onRevoke={() => setRevoking(row)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {showAdd && (
        <AddUserDialog
          onClose={() => setShowAdd(false)}
          onCreated={(created) => {
            setShowAdd(false);
            setCredentials({ email: created.email, password: created.generated_password });
            load();
          }}
        />
      )}
      {credentials && (
        <CredentialsDialog email={credentials.email} password={credentials.password} onClose={() => setCredentials(null)} />
      )}
      {revoking && (
        <RevokeDialog
          row={revoking}
          onClose={() => setRevoking(null)}
          onRevoked={() => {
            setRevoking(null);
            load();
          }}
        />
      )}
    </div>
  );
}
