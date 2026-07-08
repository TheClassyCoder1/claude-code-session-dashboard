"use client";

import { useMemo, useState } from "react";
import { dailyRollup, type FeatureRecord } from "@/lib/featureTypes";
import { formatTokens, formatUsd } from "@/lib/format";

// Pure-CSS daily cost bars for the last 14 days. ponytail: no chart lib —
// divs with scaled heights cover "how much did I spend this week".
export default function CostChart({ records }: { records: FeatureRecord[] }) {
  const [now] = useState(() => Date.now());
  const days = useMemo(() => dailyRollup(records, 14, now), [records, now]);
  const max = Math.max(...days.map((d) => d.costUsd), 0.0001);
  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Daily est. cost — last 14 days
        </h3>
        <span className="text-xs text-slate-500">
          {formatUsd(days.reduce((s, d) => s + d.costUsd, 0))} total
        </span>
      </div>
      <div className="flex h-24 items-end gap-1">
        {days.map((d) => (
          <div
            key={d.day}
            className="group relative flex-1"
            title={`${d.day}: ${formatUsd(d.costUsd)} · ${formatTokens(d.outputTokens)} out · ${d.sessions} session(s)`}
          >
            <div
              className={`w-full rounded-t transition-colors ${
                d.sessions > 0 ? "bg-emerald-400 group-hover:bg-emerald-500" : "bg-slate-100"
              }`}
              style={{ height: `${Math.max((d.costUsd / max) * 100, d.sessions > 0 ? 4 : 2)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-slate-400">
        <span>{days[0]?.day.slice(5)}</span>
        <span>{days[days.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}
