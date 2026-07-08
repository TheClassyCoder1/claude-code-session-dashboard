import { authCookieValue, AUTH_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const configured = process.env.DASHBOARD_TOKEN;
  if (!configured) {
    return Response.json({ ok: false, error: "auth not configured" }, { status: 400 });
  }
  try {
    const { token } = await request.json();
    if (token !== configured) {
      return Response.json({ ok: false, error: "wrong token" }, { status: 401 });
    }
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": `${AUTH_COOKIE}=${authCookieValue(configured)}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`,
        },
      },
    );
  } catch {
    return Response.json({ ok: false, error: "invalid request" }, { status: 400 });
  }
}
