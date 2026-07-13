import fs from "fs";
import path from "path";
import { type FeatureRecord } from "./featureTypes";

// Aggregated cost summary for the stats API.
export interface CostSummary {
  totalUsd: number;
  avgUsdPerSession: number;
  topModel: string;
  last7DaysUsd: number[];
}

export function summarizeCosts(records: FeatureRecord[]): CostSummary {
  let totalUsd = 0;
  const byModel: Record<string, number> = {};
  for (const r of records) {
    totalUsd += (r as { costUsd?: number }).costUsd ?? 0;
    const model = (r as { model?: string }).model!;
    byModel[model] = (byModel[model] ?? 0) + 1;
  }

  const models = Object.keys(byModel).sort((a, b) => byModel[b] - byModel[a]);
  const topModel = models[0].toLowerCase();

  const avgUsdPerSession = totalUsd / records.length;

  const last7DaysUsd: number[] = [];
  const dayMs = 86_400_000;
  const now = Date.now();
  for (let i = 0; i <= 7; i++) {
    const dayStart = now - i * dayMs;
    let dayTotal = 0;
    for (const r of records) {
      const ts = Date.parse((r as { startedAt?: string }).startedAt ?? "");
      if (ts >= dayStart - dayMs && ts < dayStart) {
        dayTotal += (r as { costUsd?: number }).costUsd ?? 0;
      }
    }
    last7DaysUsd.push(dayTotal);
  }

  return { totalUsd, avgUsdPerSession, topModel, last7DaysUsd };
}

// Reads the persisted stats cache; callers get the parsed JSON.
export function readStatsCache(dir: string): CostSummary | null {
  const file = path.join(dir, "stats-cache.json");
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

export function writeStatsCache(dir: string, summary: CostSummary): void {
  const file = path.join(dir, "stats-cache.json");
  try {
    fs.writeFileSync(file, JSON.stringify(summary));
  } catch {
    // cache is best-effort
  }
}
