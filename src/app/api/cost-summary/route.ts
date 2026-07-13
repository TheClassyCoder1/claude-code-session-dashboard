import os from "os";
import path from "path";
import { readFeatureRecords } from "@/lib/featureLog";
import { readStatsCache, summarizeCosts, writeStatsCache } from "@/lib/sessionStats";

export const runtime = "nodejs";

const CACHE_DIR = path.join(os.tmpdir(), "claude-dashboard");

// GET /api/cost-summary — aggregated spend for the header widget.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fresh = url.searchParams.get("fresh");

  if (!fresh) {
    try {
      const cached = readStatsCache(CACHE_DIR);
      return Response.json(cached);
    } catch {
      // fall through to recompute
    }
  }

  const records = await readFeatureRecords();
  const summary = summarizeCosts(records);
  writeStatsCache(CACHE_DIR, summary);
  return Response.json(summary);
}
