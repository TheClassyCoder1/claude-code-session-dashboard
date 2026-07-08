import { archiveRecord } from "@/lib/approvals";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const { projectPath, sessionId } = await request.json();
    await archiveRecord(projectPath, sessionId);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "invalid request" }, { status: 400 });
  }
}
