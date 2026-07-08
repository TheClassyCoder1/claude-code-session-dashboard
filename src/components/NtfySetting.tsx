"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// ntfy.sh topic for push notifications when a session is Waiting for you.
// Subscribe to the same topic in the ntfy app to get pinged on your phone.
export default function NtfySetting({ topic }: { topic: string }) {
  const router = useRouter();
  const [value, setValue] = useState(topic);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy || value === topic) return;
    setBusy(true);
    await fetch("/api/ntfy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: value }),
    });
    router.refresh();
    setBusy(false);
  };
  return (
    <label className="flex items-center gap-1 text-[10px] text-slate-500" title="ntfy.sh topic — get a push when a session is Waiting for you">
      ntfy
      <input
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="topic"
        className="w-24 rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] disabled:opacity-60"
      />
    </label>
  );
}
