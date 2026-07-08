"use client";

import { useMemo, useState } from "react";
import { dailyRollup, type FeatureRecord } from "@/lib/featureTypes";

const LEVELS = ["bg-slate-100", "bg-emerald-200", "bg-emerald-400", "bg-emerald-600"];
const level = (n: number) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3);

// GitHub-style activity grid: sessions per day, last 12 weeks, columns = weeks.
// Hover state renders one shared label under the grid — instant, never clipped,
// no native-tooltip delay.
export default function Heatmap({ records }: { records: FeatureRecord[] }) {
  const [now] = useState(() => Date.now());
  const [hover, setHover] = useState<{ day: string; sessions: number } | null>(null);
  const days = useMemo(() => dailyRollup(records, 84, now), [records, now]);
  const weeks = useMemo(() => {
    const w: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += 7) w.push(days.slice(i, i + 7));
    return w;
  }, [days]);
  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Activity — last 12 weeks
      </h3>
      <div className="flex gap-1" onMouseLeave={() => setHover(null)}>
        {weeks.map((week, i) => (
          <div key={i} className="flex flex-col gap-1">
            {week.map((d) => (
              <div
                key={d.day}
                onMouseEnter={() => setHover(d)}
                className={`h-3 w-3 cursor-default rounded-sm ring-slate-400 transition-transform hover:scale-125 hover:ring-1 ${LEVELS[level(d.sessions)]}`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 h-4 text-[11px] text-slate-500">
        {hover
          ? `${hover.day} — ${hover.sessions} session${hover.sessions === 1 ? "" : "s"}`
          : "Hover a day"}
      </p>
    </div>
  );
}
