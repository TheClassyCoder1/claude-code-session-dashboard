"use client";

import { useState } from "react";

// A one-line shell command with a copy button. Server parents stay server; only
// this button needs the client for the clipboard API.
export default function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600">
        {command}
      </code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
