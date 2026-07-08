import { writeNtfyTopic } from "@/lib/approvals";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const { topic } = await request.json();
    const set = await writeNtfyTopic(topic);
    return Response.json({ ok: true, topic: set });
  } catch {
    return Response.json({ ok: false, error: "invalid topic" }, { status: 400 });
  }
}
