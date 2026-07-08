"use client";

import { useMemo, useState } from "react";
import {
  aggregate,
  deriveStatus,
  groupRecords,
  matchesQuery,
  STATUS_META,
  type FeatureRecord,
  type Status,
  type ViewBy,
} from "@/lib/featureTypes";
import { formatTokens, formatUsd } from "@/lib/format";
import type { PendingApproval, AwaitingPrompt } from "@/lib/approvals";
import StatsHeader from "./StatsHeader";
import Heatmap from "./Heatmap";
import ExportButton from "./ExportButton";
import FeatureItem from "./FeatureItem";
import PendingApprovalCard from "./PendingApproval";
import SendPrompt from "./SendPrompt";

const SECTION_ORDER = (Object.keys(STATUS_META) as Status[]).sort(
  (a, b) => STATUS_META[a].order - STATUS_META[b].order,
);
const VIEWS: { id: ViewBy; label: string }[] = [
  { id: "feature", label: "Feature" },
  { id: "session", label: "Session" },
  { id: "project", label: "Project" },
];

type PendingMap = Record<string, PendingApproval>;
type AwaitingMap = Record<string, AwaitingPrompt>;
type TailMap = Record<string, string>;

// A record card plus, if the session is paused on a permission prompt, its
// Approve/Deny panel; or, if it finished a turn and is awaiting input in
// Dashboard mode, a Send-prompt box. Used by every view.
function RecordCard({
  record,
  pending,
  awaiting,
  tail,
}: {
  record: FeatureRecord;
  pending?: PendingApproval;
  awaiting?: AwaitingPrompt;
  tail?: string;
}) {
  const label =
    record.summaryHeadline?.trim() ||
    record.userPrompts[0] ||
    `${record.projectName} · ${record.sessionId.slice(0, 8)}`;
  return (
    <div>
      <FeatureItem record={record} liveTail={tail} />
      {pending && <PendingApprovalCard pending={pending} label={label} />}
      {awaiting && !pending && (
        <SendPrompt sessionId={record.sessionId} label={label} lastReply={awaiting.lastReply} />
      )}
    </div>
  );
}

function StatusSections({
  records,
  pendingBySession,
  awaitingBySession,
  tailBySession,
}: {
  records: FeatureRecord[];
  pendingBySession: PendingMap;
  awaitingBySession: AwaitingMap;
  tailBySession: TailMap;
}) {
  const groups = Object.fromEntries(
    SECTION_ORDER.map((s) => [s, [] as FeatureRecord[]]),
  ) as Record<Status, FeatureRecord[]>;
  for (const r of records) groups[deriveStatus(r)].push(r);
  return (
    <div className="space-y-6">
      {SECTION_ORDER.map((status) => {
        const items = groups[status];
        if (items.length === 0) return null;
        const meta = STATUS_META[status];
        return (
          <section key={status}>
            <div className="mb-2 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              <h2 className="text-sm font-semibold text-slate-700">{meta.label}</h2>
              <span className="rounded-full bg-slate-200 px-2 text-xs text-slate-600">
                {items.length}
              </span>
            </div>
            <div className="space-y-3">
              {items.map((r) => (
                <RecordCard
                  key={`${r.projectPath}:${r.sessionId}`}
                  record={r}
                  pending={pendingBySession[r.sessionId]}
                  awaiting={awaitingBySession[r.sessionId]}
                  tail={tailBySession[r.sessionId]}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GroupedView({
  records,
  by,
  pendingBySession,
  awaitingBySession,
  tailBySession,
}: {
  records: FeatureRecord[];
  by: "session" | "project";
  pendingBySession: PendingMap;
  awaitingBySession: AwaitingMap;
  tailBySession: TailMap;
}) {
  const groups = useMemo(() => groupRecords(records, by), [records, by]);
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <details key={g.key} open className="group/section">
          <summary className="mb-2 flex cursor-pointer list-none items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-slate-300 transition-transform group-open/section:rotate-90">
                ▶
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-700">{g.title}</h2>
                <p className="truncate text-xs text-slate-500">{g.subtitle}</p>
              </div>
            </div>
            <div className="shrink-0 text-right text-xs text-slate-500">
              {formatTokens(g.totalOutputTokens)} out · {formatUsd(g.totalCostUsd)}
            </div>
          </summary>
          <div className="space-y-3">
            {g.records.map((r) => (
              <RecordCard
                key={`${r.projectPath}:${r.sessionId}`}
                record={r}
                pending={pendingBySession[r.sessionId]}
                awaiting={awaitingBySession[r.sessionId]}
                tail={tailBySession[r.sessionId]}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

export default function FeatureDashboard({
  records,
  pendingBySession = {},
  awaitingBySession = {},
  tailBySession = {},
}: {
  records: FeatureRecord[];
  pendingBySession?: PendingMap;
  awaitingBySession?: AwaitingMap;
  tailBySession?: TailMap;
}) {
  const projects = useMemo(
    () => [...new Set(records.map((r) => r.projectName))].sort(),
    [records],
  );
  const [project, setProject] = useState<string>("all");
  const [view, setView] = useState<ViewBy>("feature");
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      records
        .filter((r) => project === "all" || r.projectName === project)
        .filter((r) => matchesQuery(r, query)),
    [records, project, query],
  );
  const stats = useMemo(() => aggregate(filtered), [filtered]);

  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-700">No feature records yet.</p>
        <p className="mx-auto mt-2 max-w-md text-xs text-slate-500">
          Install the Claude Code hook with{" "}
          <code className="rounded bg-slate-100 px-1">node tools/feature-logger/install.mjs</code>,
          then work in any Claude Code session. Records appear in{" "}
          <code className="rounded bg-slate-100 px-1">~/.claude/feature-log/</code>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <StatsHeader stats={stats} />
      <Heatmap records={filtered} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                view === v.id
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions…"
          className="w-40 rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-slate-500 focus:outline-none sm:w-52"
        />
        <ExportButton records={filtered} />

        {projects.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Project</label>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {view === "feature" ? (
        project === "all" ? (
          // All projects → one section per project, its sessions underneath.
          <GroupedView
            records={filtered}
            by="project"
            pendingBySession={pendingBySession}
            awaitingBySession={awaitingBySession}
            tailBySession={tailBySession}
          />
        ) : (
          <StatusSections
            records={filtered}
            pendingBySession={pendingBySession}
            awaitingBySession={awaitingBySession}
            tailBySession={tailBySession}
          />
        )
      ) : (
        <GroupedView
          records={filtered}
          by={view}
          pendingBySession={pendingBySession}
          awaitingBySession={awaitingBySession}
          tailBySession={tailBySession}
        />
      )}
    </div>
  );
}
