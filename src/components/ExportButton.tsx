"use client";

import { useState } from "react";
import { exportMarkdown, type FeatureRecord } from "@/lib/featureTypes";

// Copies a standup-style Markdown summary of today's (filtered) sessions.
export default function ExportButton({ records }: { records: FeatureRecord[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        const day = new Date().toISOString().slice(0, 10);
        await navigator.clipboard.writeText(exportMarkdown(records, day));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-600 transition-colors hover:bg-slate-100"
    >
      {copied ? "Copied ✓" : "Copy today ⤴"}
    </button>
  );
}
