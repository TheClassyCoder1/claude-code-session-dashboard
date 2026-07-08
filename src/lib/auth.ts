import { createHash, timingSafeEqual } from "crypto";

// Opt-in auth: with no DASHBOARD_TOKEN in the env the dashboard stays fully
// open (local single-user default). Setting the token gates the action APIs —
// the page itself stays viewable (read-only). The cookie carries a hash of the
// token, not the token itself.

export const AUTH_COOKIE = "dash_auth";

export function authCookieValue(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieFrom(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === AUTH_COOKIE) return v.join("=");
  }
  return null;
}

/** Is this request allowed to perform actions? Pass the Cookie header (or null). */
export function isAuthed(cookieHeader: string | null): boolean {
  const token = process.env.DASHBOARD_TOKEN;
  if (!token) return true;
  const cookie = cookieFrom(cookieHeader);
  if (!cookie) return false;
  const expected = Buffer.from(authCookieValue(token));
  const got = Buffer.from(cookie);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** 401 Response if unauthed, else null. Drop-in guard for action routes. */
export function requireAuth(request: Request): Response | null {
  if (isAuthed(request.headers.get("cookie"))) return null;
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
