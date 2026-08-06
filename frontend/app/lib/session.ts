// Signed, stateless session cookie for the Outlook Invoices login - no
// database/session store needed. The cookie's signature is an HMAC keyed by
// INVOICES_AUTH_PASSWORD, so only a server that knows the password could
// have produced a valid one; verifying it just re-derives the same HMAC and
// compares. Uses Web Crypto (crypto.subtle) so this works unmodified in both
// the Node runtime (API routes) and the Edge runtime (middleware.ts).

export const SESSION_COOKIE_NAME = "outlook_invoices_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionCookieValue(username: string, password: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `${username}:${expiresAt}`;
  const signature = await hmacHex(password, payload);
  return `${btoa(payload)}.${signature}`;
}

export async function verifySessionCookieValue(
  value: string | undefined,
  expectedUsername: string,
  password: string
): Promise<boolean> {
  if (!value) return false;
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return false;

  let payload: string;
  try {
    payload = atob(encodedPayload);
  } catch {
    return false;
  }

  const expectedSignature = await hmacHex(password, payload);
  if (!timingSafeEqual(signature, expectedSignature)) return false;

  const [payloadUser, expiresAtRaw] = payload.split(":");
  if (!timingSafeEqual(payloadUser ?? "", expectedUsername)) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}
