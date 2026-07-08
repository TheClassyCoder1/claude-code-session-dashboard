"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Shown instead of the action controls when DASHBOARD_TOKEN is set and this
// browser hasn't unlocked yet. Posting the right token sets the auth cookie.
export default function UnlockForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    if (!token || busy) return;
    setBusy(true);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) router.refresh();
    else setError(true);
    setBusy(false);
  };
  return (
    <div className="flex items-center gap-2">
      <input
        type="password"
        value={token}
        onChange={(e) => {
          setToken(e.target.value);
          setError(false);
        }}
        onKeyDown={(e) => e.key === "Enter" && unlock()}
        placeholder="Access token"
        className={`w-32 rounded border px-2 py-1 text-xs focus:outline-none ${
          error ? "border-rose-400 bg-rose-50" : "border-slate-300 bg-white"
        }`}
      />
      <button
        disabled={busy || !token}
        onClick={unlock}
        className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        Unlock
      </button>
    </div>
  );
}
