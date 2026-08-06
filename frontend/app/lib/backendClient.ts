// Server-only helpers for proxying to the FastAPI backend from Next.js API
// routes (app/api/invoices/**). The browser never talks to the backend
// directly for these routes - only this server does, using
// INVOICES_AUTH_USER/PASSWORD as HTTP Basic Auth credentials the browser
// never sees. That's what makes this a single-origin, single-login setup
// instead of the two-origin double-prompt Basic Auth design this replaced.

// Deliberately NOT NEXT_PUBLIC_API_BASE_URL - that one is read by the
// browser and must be host-reachable (e.g. localhost:8000). This one is
// read by the Next.js server process itself, which under Docker Compose
// must use the service name "backend", not "localhost" (see
// docker-compose.yml's INTERNAL_API_BASE_URL).
const INTERNAL_API_BASE_URL = process.env.INTERNAL_API_BASE_URL || "http://localhost:8000";

export function backendUrl(path: string): string {
  return `${INTERNAL_API_BASE_URL}${path}`;
}

export function backendAuthHeader(): string {
  const user = process.env.INVOICES_AUTH_USER || "";
  const password = process.env.INVOICES_AUTH_PASSWORD || "";
  return "Basic " + btoa(`${user}:${password}`);
}
