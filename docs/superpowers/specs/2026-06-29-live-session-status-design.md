# Live session status: "Waiting for you" & "Finished — waiting for input"

Date: 2026-06-29

## Problem

The dashboard shows three lifecycle states — `todo` / `in_progress` / `done`.
It can't tell, for an ongoing session, whether:

- **Claude is paused on a permission prompt** waiting for the user to accept/reject a tool, or
- **Claude finished its turn and is idle**, waiting for the user's next message.

Both currently collapse into `in_progress`. Users want these surfaced as distinct,
near-live states.

## Goals

- Add two distinct visible statuses: `awaiting_approval` ("Waiting for you") and
  `idle` ("Finished — waiting for input").
- Near-live: status reflects reality within ~3s, no manual reload.

## Non-goals

- No live tail/parse of raw transcripts to infer state (`stop_reason`, unanswered
  `tool_use`) — native hooks give the signal directly.
- No websockets / SSE / file watching — existing RSC polling suffices.
- No distinction among permission *types* (Bash vs Write etc.) — one "Waiting for you".

## Approach (chosen)

Hook-driven. Wire two more native Claude Code hook events into the existing
`feature-logger.mjs`, persist a `liveState` field on each record, derive the new
statuses from it, and shorten the existing poll interval.

Rejected: live transcript scan (heavy I/O, `stop_reason`/permission state not
reliably present in transcripts) and hybrid (overkill).

## Design

### 1. New hook events

`tools/feature-logger/install.mjs` registers the same hook command for two more
events, in addition to the current `SessionStart` / `Stop` / `SessionEnd`:

- `UserPromptSubmit`
- `Notification`

The event loop in `install.mjs` (currently
`for (const event of ["SessionStart", "Stop", "SessionEnd"])`) gains the two new
names. Registration stays idempotent (`hasOurHook`) and re-running install adds the
new events to an existing install.

### 2. `liveState` on the record

New field, type `"awaiting_approval" | "idle" | undefined`. `undefined` means "no
live override — fall through to the turn/summary-based status".

`main()` in `feature-logger.mjs` sets it per event, applied to **every** per-project
base of the session (a session is in one state; marking all its records is simplest
and correct enough):

| Event              | `liveState` set to                                              |
|--------------------|-----------------------------------------------------------------|
| `SessionStart`     | `undefined`                                                     |
| `UserPromptSubmit` | `undefined` (user sent a prompt → session is working again)     |
| `Notification`     | `"awaiting_approval"` **iff** `/permission/i.test(input.message)`; otherwise leave unchanged (preserve existing) |
| `Stop`             | `"idle"`                                                        |
| `SessionEnd`       | `undefined` (status becomes `done` via the summary)            |

Notes:

- Idle-timeout notifications (Claude Code also fires `Notification` after ~60s of
  input idle) are **ignored** — they don't match `/permission/i`, and `Stop` already
  produces `idle`. On a non-permission notification we preserve `existing.liveState`
  rather than overwriting, so an `awaiting_approval` set moments earlier survives.
- `bump schemaVersion` 1 → 2.

### 3. Reader

`src/lib/featureLog.ts` `recordSchema`: add `liveState: z.enum(["awaiting_approval",
"idle"]).optional()`. Old records (no field, schemaVersion 1) still validate and
read as `undefined`. No migration needed.

`FeatureRecord` type in `src/lib/featureTypes.ts` gains `liveState?: "awaiting_approval" | "idle"`.

### 4. Status derivation

`src/lib/featureTypes.ts`:

```ts
export type Status =
  | "todo" | "in_progress" | "awaiting_approval" | "idle" | "done";

export function deriveStatus(r: FeatureRecord): Status {
  if (r.summary && r.summarySource) return "done";
  if (r.liveState === "awaiting_approval") return "awaiting_approval";
  if (r.liveState === "idle") return "idle";
  if (r.turns > 0 || countChanges(r) > 0) return "in_progress";
  return "todo";
}
```

Precedence rationale: a finished+summarized session is `done` regardless of stale
`liveState`; `awaiting_approval` outranks `idle` so a pending permission isn't masked.

### 5. STATUS_META + display order

Add two entries. Order (top → bottom of dashboard):

| order | status             | label                         | badge / dot palette |
|-------|--------------------|-------------------------------|---------------------|
| 0     | awaiting_approval  | Waiting for you               | amber               |
| 1     | in_progress        | In progress                   | blue (existing)     |
| 2     | idle               | Finished — waiting for input  | cyan                |
| 3     | todo               | To do                         | slate (existing)    |
| 4     | done               | Done                          | emerald (existing)  |

Existing `in_progress` / `todo` / `done` `order` values shift to match the table.
`awaiting_approval` description: "Claude is paused — needs you to accept a prompt."
`idle` description: "Claude finished its turn — waiting for your next message."

`FeatureDashboard.tsx` groups records by `deriveStatus`; it iterates `STATUS_META`
order, so the two new groups render automatically once added. `FeatureItem.tsx`
reads `meta.badge` / `meta.dot` / `meta.label` — no change needed.

### 6. Near-live polling

`src/components/AutoRefresh.tsx`: change default `intervalMs` from `30_000` to
`3_000`. Page stays `force-dynamic`; `router.refresh()` re-runs the RSC, which
re-reads the records dir and reconciles. No new API route.

## Data flow

```
Claude Code event ─▶ feature-logger.mjs (Notification/UserPromptSubmit/Stop/…)
  └─ parseTranscript → bases, set liveState per event
     └─ writeAtomic ~/.claude/feature-log/<slug>/<session>.json   (schemaVersion 2)

Browser ── every 3s ──▶ router.refresh()
  └─ page.tsx RSC → readFeatureRecords() → deriveStatus() → STATUS_META group/badge
```

## Error handling

- Hooks keep the existing contract: every path exits 0, all work in try/catch, never
  blocks the user's turn. Unknown/extra event names are no-ops (record just rewritten).
- Malformed `input.message` on `Notification`: `/permission/i.test(undefined)` is
  `false` → treated as non-permission → preserves existing `liveState`. Safe.
- Reader: a record failing the (now v2) schema returns `null` and is skipped, as today.

## Known shortcuts (ponytail)

- **Last-write-wins** between concurrent hook invocations for the same session.
  Acceptable for a single-user local tool; upgrade to a lock only if races misorder
  state in practice.
- **3s full-dir re-read even when nothing is active.** Fine at local scale (a few
  dozen small JSON files). Upgrade path: make `AutoRefresh` poll faster only when at
  least one visible record is `awaiting_approval`/`in_progress`, slower otherwise.
- **liveState applied to all per-project bases**, not just the active cwd's record.
  A multi-project session shows the same live state on each card. Rare; acceptable.

## Testing

- `feature-logger.test.mjs`: extend to assert `liveState` is set correctly per event
  — `Notification` with a permission message → `"awaiting_approval"`; `Notification`
  with a non-permission message → preserves prior; `Stop` → `"idle"`;
  `UserPromptSubmit` → `undefined`.
- `featureTypes.test.ts`: `deriveStatus` precedence — `done` beats `liveState`;
  `awaiting_approval` beats `idle`; `idle` beats `in_progress`; `undefined` liveState
  falls through to existing behavior.
- Manual: run a real session, trigger a permission prompt → card shows "Waiting for
  you"; accept and let the turn end → "Finished — waiting for input"; send a new
  prompt → "In progress".

## Files touched

- `tools/feature-logger/install.mjs` — register 2 new events
- `tools/feature-logger/feature-logger.mjs` — set `liveState` per event; bump schemaVersion
- `tools/feature-logger/feature-logger.test.mjs` — liveState assertions
- `src/lib/featureLog.ts` — schema: optional `liveState`
- `src/lib/featureTypes.ts` — `Status` union, `FeatureRecord.liveState`, `deriveStatus`, `STATUS_META`, orders
- `src/lib/featureTypes.test.ts` — deriveStatus precedence
- `src/components/AutoRefresh.tsx` — interval 30s → 3s
