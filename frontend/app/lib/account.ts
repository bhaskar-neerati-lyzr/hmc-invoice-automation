import type { AuthUser, Role } from "./auth";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export type UserRow = {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  must_reset_password: boolean;
  created_at: string;
};

async function throwIfNotOk(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  let message = fallback;
  try {
    const body = await res.json();
    if (body?.detail) message = body.detail;
  } catch {
    // keep fallback
  }
  throw new Error(message);
}

export async function fetchAccount(authFetch: AuthFetch): Promise<AuthUser> {
  const res = await authFetch("/api/account", { cache: "no-store" });
  await throwIfNotOk(res, "Failed to load account.");
  return res.json();
}

export async function changePassword(
  authFetch: AuthFetch,
  body: { current_password: string; new_password: string }
): Promise<void> {
  const res = await authFetch("/api/account/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await throwIfNotOk(res, "Failed to change password.");
}

export async function fetchUsers(authFetch: AuthFetch): Promise<UserRow[]> {
  const res = await authFetch("/api/users", { cache: "no-store" });
  await throwIfNotOk(res, "Failed to load users.");
  return res.json();
}

export async function createUser(
  authFetch: AuthFetch,
  body: { email: string; name?: string; role: Role }
): Promise<UserRow & { generated_password: string }> {
  const res = await authFetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await throwIfNotOk(res, "Failed to create user.");
  return res.json();
}

export async function revokeUser(authFetch: AuthFetch, id: number): Promise<void> {
  const res = await authFetch(`/api/users/${id}`, { method: "DELETE" });
  await throwIfNotOk(res, "Failed to revoke invitation.");
}

export async function resetInvite(
  authFetch: AuthFetch,
  id: number
): Promise<{ id: number; email: string; generated_password: string }> {
  const res = await authFetch(`/api/users/${id}/reset-invite`, { method: "POST" });
  await throwIfNotOk(res, "Failed to reset invitation.");
  return res.json();
}
