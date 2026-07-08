import { writeMode } from "@/lib/approvals";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const { mode } = await request.json();
    const set = await writeMode(mode);
    return Response.json({ ok: true, mode: set });
  } catch {
    return Response.json({ ok: false, error: "invalid mode" }, { status: 400 });
  }
}
