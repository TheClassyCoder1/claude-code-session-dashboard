import { writeRelayWindowMs } from "@/lib/approvals";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const { ms } = await request.json();
    const stored = await writeRelayWindowMs(ms);
    return Response.json({ ok: true, ms: stored });
  } catch {
    return Response.json({ ok: false, error: "invalid ms" }, { status: 400 });
  }
}
