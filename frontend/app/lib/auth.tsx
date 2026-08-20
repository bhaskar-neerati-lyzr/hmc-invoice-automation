"use client";

// Replaces the old single-shared-password HMAC cookie + Next.js proxy
// design. frontend and backend are genuinely separate origins (no reverse
// proxy - see docker-compose.yml), so this calls FastAPI directly with a
// Bearer JWT instead of fighting cross-origin cookies: the token lives in
// localStorage, and authFetch attaches it to every call.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const TOKEN_STORAGE_KEY = "ocr_app_token";

export type Role = "admin" | "viewer";

export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  must_reset_password: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAccount: () => Promise<void>;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.detail || fallback;
  } catch {
    return fallback;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const authFetch = useCallback(
    (path: string, init: RequestInit = {}) => {
      const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(url, { ...init, headers });
    },
    [token]
  );

  const refreshAccount = useCallback(async () => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    if (!stored) {
      setUser(null);
      setLoading(false);
      return;
    }
    const res = await fetch(`${API_BASE_URL}/api/account`, {
      headers: { Authorization: `Bearer ${stored}` },
    });
    if (!res.ok) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }
    const account = await res.json();
    setToken(stored);
    setUser(account);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: read the stored token and hydrate the session on mount
    refreshAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run once on mount only
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Incorrect email or password."));
    }
    const data = await res.json();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, logout, refreshAccount, authFetch }),
    [user, token, loading, login, logout, refreshAccount, authFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
