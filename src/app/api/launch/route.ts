import { launchSession } from "@/lib/launch";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const { projectPath, prompt } = await request.json();
    await launchSession(projectPath, prompt);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "invalid request" }, { status: 400 });
  }
}
