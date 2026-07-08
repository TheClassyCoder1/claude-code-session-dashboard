"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Launch a new headless `claude -p` run in one of the known project dirs.
// Collapsed by default; the run shows up as a session card via the hooks.
export default function NewSession({ projects }: { projects: string[] }) {
  const router = useRouter();
  const [projectPath, setProjectPath] = useState(projects[0] ?? "");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [launched, setLaunched] = useState(false);

  if (projects.length === 0) return null;

  const launch = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectPath, prompt }),
    });
    if (res.ok) {
      setPrompt("");
      setLaunched(true);
      setTimeout(() => setLaunched(false), 4000);
      router.refresh();
    }
    setBusy(false);
  };

  return (
    <details className="mb-4 rounded-lg border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none p-3 text-sm font-semibold text-slate-700">
        ＋ New session
      </summary>
      <div className="border-t border-slate-100 p-3">
        <div className="mb-2 flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Project</label>
          <select
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="What should Claude do? Runs headless (claude -p)…"
          className="w-full rounded border border-slate-300 bg-white p-2 text-xs focus:border-slate-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            disabled={busy || !prompt.trim()}
            onClick={launch}
            className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Launching…" : "Launch"}
          </button>
          {launched && (
            <span className="text-[10px] font-medium text-emerald-700">
              Launched — card appears when the session starts reporting.
            </span>
          )}
        </div>
      </div>
    </details>
  );
}
