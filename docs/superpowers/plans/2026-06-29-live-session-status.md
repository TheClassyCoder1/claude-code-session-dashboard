# Live Session Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface two new near-live dashboard statuses — "Waiting for you" (Claude paused on a permission prompt) and "Finished — waiting for input" (turn ended, idle).

**Architecture:** Two more native Claude Code hook events (`UserPromptSubmit`, `Notification`) feed the existing `feature-logger.mjs`, which writes a `liveState` field onto each per-session record. The reader validates it, `deriveStatus()` maps it to two new `Status` values, and the dashboard renders them via `STATUS_META`. The existing `AutoRefresh` RSC poll drops to 3s for near-live updates.

**Tech Stack:** Node.js (zero-dep hook script, `node:test`), Next.js 16 (RSC), TypeScript, Zod, Tailwind.

## Global Constraints

- This is NOT stock Next.js — read `node_modules/next/dist/docs/` before touching Next APIs; heed deprecation notices.
- The hook script (`feature-logger.mjs`) is zero-dependency and must NEVER block a turn: every path exits 0, all work wrapped in try/catch.
- Pure functions are exported from `feature-logger.mjs` for unit tests; `main()` runs only via the entry guard.
- Tests run with `npm test` → `node --test "src/**/*.test.ts" "tools/**/*.test.mjs"`.
- Old records (schemaVersion 1, no `liveState`) must keep validating and reading as `liveState: undefined` — no migration.
- `liveState` type is exactly `"awaiting_approval" | "idle" | undefined`.

---

### Task 1: `liveStateForEvent` helper + wire into the hook

**Files:**
- Modify: `tools/feature-logger/feature-logger.mjs` (add exported helper ~after line 95; set `record.liveState` and bump `schemaVersion` in `main()` ~lines 406-417)
- Test: `tools/feature-logger/feature-logger.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `liveStateForEvent(event: string, message: string|undefined, existing: string|undefined) => "awaiting_approval" | "idle" | undefined`. Record JSON now carries `liveState` and `schemaVersion: 2`.

- [ ] **Step 1: Write the failing test**

Add to `tools/feature-logger/feature-logger.test.mjs`:

```js
import {
  classify,
  isRealPrompt,
  slugForCwd,
  redactSecrets,
  parseTranscript,
  liveStateForEvent,
} from "./feature-logger.mjs";

test("liveStateForEvent: permission notification → awaiting_approval", () => {
  assert.equal(
    liveStateForEvent("Notification", "Claude needs your permission to use Bash", undefined),
    "awaiting_approval",
  );
});

test("liveStateForEvent: non-permission notification preserves existing state", () => {
  assert.equal(
    liveStateForEvent("Notification", "Claude is waiting for your input", "awaiting_approval"),
    "awaiting_approval",
  );
  assert.equal(liveStateForEvent("Notification", "", undefined), undefined);
  assert.equal(liveStateForEvent("Notification", undefined, "idle"), "idle");
});

test("liveStateForEvent: Stop → idle", () => {
  assert.equal(liveStateForEvent("Stop", undefined, "awaiting_approval"), "idle");
});

test("liveStateForEvent: UserPromptSubmit / SessionStart / SessionEnd → cleared", () => {
  assert.equal(liveStateForEvent("UserPromptSubmit", undefined, "idle"), undefined);
  assert.equal(liveStateForEvent("SessionStart", undefined, "idle"), undefined);
  assert.equal(liveStateForEvent("SessionEnd", undefined, "awaiting_approval"), undefined);
});
```

Note: the existing import block (lines 6-12) must be replaced with the one above (it adds `liveStateForEvent`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/feature-logger/feature-logger.test.mjs`
Expected: FAIL — `liveStateForEvent is not a function` / `not exported`.

- [ ] **Step 3: Add the helper**

Insert into `tools/feature-logger/feature-logger.mjs` after `redactSecrets` (after line 95):

```js
// ---------------------------------------------------------------------------
// Live state: maps a hook event to the session's current waiting-state.
//   awaiting_approval — Claude paused, needs the user to accept a prompt
//   idle              — Claude finished its turn, waiting for the next message
//   undefined         — no live override; fall back to turn/summary status
// ---------------------------------------------------------------------------
export function liveStateForEvent(event, message, existing) {
  switch (event) {
    case "Notification":
      // Claude Code also fires Notification on ~60s input idle; only permission
      // prompts set the waiting state. Non-permission → keep whatever we had.
      return /permission/i.test(message || "") ? "awaiting_approval" : existing;
    case "Stop":
      return "idle";
    case "UserPromptSubmit":
    case "SessionStart":
    case "SessionEnd":
      return undefined;
    default:
      return existing;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/feature-logger/feature-logger.test.mjs`
Expected: PASS (all liveStateForEvent tests + existing ones).

- [ ] **Step 5: Wire `liveState` + schemaVersion into `main()`**

In `tools/feature-logger/feature-logger.mjs`, change the record object (lines 406-417). Set `schemaVersion: 2` and add the `liveState` line:

```js
    const record = {
      schemaVersion: 2,
      sessionId,
      ...base,
      // Preserve any summary already written (e.g. a late Stop after SessionEnd).
      summary: existing.summary || "",
      summaryHeadline: existing.summaryHeadline || "",
      summarySource: existing.summarySource || "",
      summaryUsage: existing.summaryUsage,
      summaryCostUsd: existing.summaryCostUsd,
      liveState: liveStateForEvent(event, input.message, existing.liveState),
      updatedAt: new Date().toISOString(),
    };
```

(`event` and `input` are already in scope from lines 385/378. `input.message` is the Notification hook's message field; `undefined` for other events.)

- [ ] **Step 6: Run the full hook test file again**

Run: `node --test tools/feature-logger/feature-logger.test.mjs`
Expected: PASS (the record-shape change is exercised manually later; unit tests cover the helper).

- [ ] **Step 7: Commit**

```bash
git add tools/feature-logger/feature-logger.mjs tools/feature-logger/feature-logger.test.mjs
git commit -m "feat: derive session liveState from hook events"
```

---

### Task 2: Register the two new hook events on install

**Files:**
- Modify: `tools/feature-logger/install.mjs` (extract `HOOK_EVENTS` const; use it in the loop at line 77)
- Test: `tools/feature-logger/install.test.mjs` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: exported `HOOK_EVENTS` array; installer registers the feature-logger command for all five events.

- [ ] **Step 1: Write the failing test**

Create `tools/feature-logger/install.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOOK_EVENTS } from "./install.mjs";

test("HOOK_EVENTS covers lifecycle + the live-state events", () => {
  assert.deepEqual(
    [...HOOK_EVENTS].sort(),
    ["Notification", "SessionEnd", "SessionStart", "Stop", "UserPromptSubmit"],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/feature-logger/install.test.mjs`
Expected: FAIL — `HOOK_EVENTS is not exported`. (It may also error that `install.mjs` runs `main()` on import — fixed in Step 3.)

- [ ] **Step 3: Export `HOOK_EVENTS`, guard `main()`, use the const**

In `tools/feature-logger/install.mjs`:

Add near the top constants (after line 23):

```js
export const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SessionEnd",
];
```

Replace the loop line (line 77):

```js
  for (const event of HOOK_EVENTS) {
```

Guard the bottom `main()` call so importing the module in a test doesn't run the installer. Replace the final `main();` line with:

```js
import { pathToFileURL } from "url";
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/feature-logger/install.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/feature-logger/install.mjs tools/feature-logger/install.test.mjs
git commit -m "feat: register UserPromptSubmit and Notification hooks"
```

---

### Task 3: Reader schema + types + status derivation + badges

**Files:**
- Modify: `src/lib/featureTypes.ts` (`Status` union line 40, `FeatureRecord` lines 8-30, `deriveStatus` lines 50-54, `STATUS_META` lines 56-81)
- Modify: `src/lib/featureLog.ts` (`recordSchema` lines 21-43)
- Test: `src/lib/featureTypes.test.ts`

**Interfaces:**
- Consumes: `liveState` field produced by Task 1.
- Produces: `Status = "todo" | "in_progress" | "awaiting_approval" | "idle" | "done"`; `deriveStatus` returns the new values; `STATUS_META` has entries for all five.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/featureTypes.test.ts`:

```ts
test("deriveStatus: liveState awaiting_approval → awaiting_approval", () => {
  assert.equal(deriveStatus(rec({ turns: 2, liveState: "awaiting_approval" })), "awaiting_approval");
});

test("deriveStatus: liveState idle → idle", () => {
  assert.equal(deriveStatus(rec({ turns: 2, liveState: "idle" })), "idle");
});

test("deriveStatus: summary beats any liveState", () => {
  assert.equal(
    deriveStatus(rec({ summary: "did x", summarySource: "claude", liveState: "awaiting_approval" })),
    "done",
  );
});

test("deriveStatus: awaiting_approval outranks idle is moot — field is single-valued; undefined falls through", () => {
  assert.equal(deriveStatus(rec({ turns: 2, liveState: undefined })), "in_progress");
});

test("STATUS_META has an entry for every Status", () => {
  for (const s of ["todo", "in_progress", "awaiting_approval", "idle", "done"] as const) {
    assert.ok(STATUS_META[s], `missing STATUS_META for ${s}`);
  }
});
```

Add `STATUS_META` to the import on line 3:

```ts
import { deriveStatus, countChanges, aggregate, STATUS_META, type FeatureRecord } from "./featureTypes.ts";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/featureTypes.test.ts`
Expected: FAIL — `rec({ liveState })` is a type error / `awaiting_approval` not returned / `STATUS_META.awaiting_approval` undefined.

- [ ] **Step 3: Extend `Status`, `FeatureRecord`, `deriveStatus`, `STATUS_META`**

In `src/lib/featureTypes.ts`:

Add to `FeatureRecord` (after line 26, before the derived fields comment):

```ts
  liveState?: "awaiting_approval" | "idle";
```

Replace `Status` (line 40):

```ts
export type Status = "todo" | "in_progress" | "awaiting_approval" | "idle" | "done";
```

Replace `deriveStatus` (lines 50-54):

```ts
/** Lifecycle status derived from the captured record. */
export function deriveStatus(r: FeatureRecord): Status {
  if (r.summary && r.summarySource) return "done";
  if (r.liveState === "awaiting_approval") return "awaiting_approval";
  if (r.liveState === "idle") return "idle";
  if (r.turns > 0 || countChanges(r) > 0) return "in_progress";
  return "todo";
}
```

Replace `STATUS_META` (lines 56-81) — note `order` values renumbered so the two new states slot in:

```ts
export const STATUS_META: Record<
  Status,
  { label: string; description: string; badge: string; dot: string; order: number }
> = {
  awaiting_approval: {
    label: "Waiting for you",
    description: "Claude is paused — needs you to accept a prompt.",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    order: 0,
  },
  in_progress: {
    label: "In progress",
    description: "Being worked on — no end-of-session summary yet.",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
    order: 1,
  },
  idle: {
    label: "Finished — waiting for input",
    description: "Claude finished its turn — waiting for your next message.",
    badge: "bg-cyan-100 text-cyan-700",
    dot: "bg-cyan-500",
    order: 2,
  },
  todo: {
    label: "To do",
    description: "Session started but not picked up yet.",
    badge: "bg-slate-200 text-slate-600",
    dot: "bg-slate-400",
    order: 3,
  },
  done: {
    label: "Done",
    description: "Completed — summarized at session end.",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    order: 4,
  },
};
```

- [ ] **Step 4: Add `liveState` to the reader schema**

In `src/lib/featureLog.ts`, add to `recordSchema` (after line 42, before the closing `})` on line 43):

```ts
  liveState: z.enum(["awaiting_approval", "idle"]).optional(),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test src/lib/featureTypes.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + lint the dashboard**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`FeatureDashboard.tsx` groups by `STATUS_META` order and `FeatureItem.tsx` reads `meta.badge/dot/label` — both pick up the new statuses with no edit. If tsc flags an exhaustive switch over `Status` anywhere, add the two cases there.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/featureTypes.ts src/lib/featureLog.ts src/lib/featureTypes.test.ts
git commit -m "feat: add awaiting_approval and idle dashboard statuses"
```

---

### Task 4: Drop the poll interval to 3s for near-live updates

**Files:**
- Modify: `src/components/AutoRefresh.tsx:8`

**Interfaces:**
- Consumes: nothing.
- Produces: dashboard refreshes every 3s.

- [ ] **Step 1: Change the default interval**

In `src/components/AutoRefresh.tsx`, change the default on line 8:

```tsx
export default function AutoRefresh({ intervalMs = 3_000 }: { intervalMs?: number }) {
```

- [ ] **Step 2: Build to confirm nothing broke**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/AutoRefresh.tsx
git commit -m "feat: poll dashboard every 3s for near-live status"
```

---

### Task 5: Reinstall hooks + manual end-to-end verification

**Files:** none (operational).

- [ ] **Step 1: Reinstall so the new events register in `~/.claude/settings.json`**

Run: `node tools/feature-logger/install.mjs`
Expected: log shows `✓ UserPromptSubmit: added feature-logger hook` and `✓ Notification: added feature-logger hook` (the three existing events report "already present").

- [ ] **Step 2: Start the dashboard**

Run: `npm run dev` (use the printed port; a prior dev server may already hold 3000).

- [ ] **Step 3: Drive a real session and watch the card**

In a NEW Claude Code session (hooks load at session start):
- Trigger a tool that needs approval → the session's card shows **"Waiting for you"** (amber) within ~3s.
- Accept it and let the turn finish → card flips to **"Finished — waiting for input"** (cyan).
- Send a new prompt → card returns to **"In progress"**.
- End the session → card becomes **"Done"**.

Expected: each transition visible without manual reload. If a state sticks, check `~/.claude/feature-log/<slug>/<session>.json` for the `liveState` field.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all pass.
