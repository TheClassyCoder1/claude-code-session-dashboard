"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ArchiveButton({
  projectPath,
  sessionId,
}: {
  projectPath: string;
  sessionId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/archive", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectPath, sessionId }),
        });
        router.refresh();
        setBusy(false);
      }}
      title="Hide this session from the dashboard (file moves to archived/)"
      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50"
    >
      {busy ? "Archiving…" : "Archive"}
    </button>
  );
}
