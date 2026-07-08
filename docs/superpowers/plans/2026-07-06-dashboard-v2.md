# Dashboard v2 — autonomous build-out

12 features on `feat/dashboard-v2`, lazy-but-tested variants, one commit each.

| # | Feature | Shape (lazy version) |
|---|---------|----------------------|
| 1 | Auth | `DASHBOARD_TOKEN` env. Unset → everything open (local default). Set → action APIs require an httpOnly cookie; `/api/auth` sets it from the token; header Unlock form. |
| 2 | Read-only mode | Falls out of 1: page always viewable; without the cookie the action APIs 401 and action UI hides (`canAct` prop). |
| 3 | Push notifications | `ntfyTopic` in mode.json (set from UI). dashboard-hook POSTs to `https://ntfy.sh/<topic>` when a pending approval / awaiting prompt is written. Fire-and-forget, errors swallowed. |
| 4 | Approve + remember | Decision file gains `remember: true` → hook appends tool to `allowed/<sid>.json`; gate skips tools already allowed for that session. Checkbox in PendingApproval. |
| 5 | Charts | Pure-CSS daily bar chart (last 14 days): cost + output tokens, from existing records. No chart lib. |
| 6 | Search/filter | Client-side text input filtering records over headline/summary/prompts/project. |
| 7 | Heatmap | GitHub-style 12-week CSS grid of sessions/day. |
| 8 | Archive | POST `/api/archive` moves record file to `archived/` (path-safe). Hide from dashboard; card gets an Archive button. |
| 9 | Export | Client-side "Copy day as Markdown" — standup-format summary of a day's sessions. |
| 10 | Launch session | POST `/api/launch` {projectPath, prompt} spawns detached `claude -p` in that cwd; session appears via hooks. Header "New session" form (authed only). |
| 11 | Live tail | feature-logger stores `transcriptPath` in the record; `/api/tail?session=` returns last assistant text (path-validated); FeatureItem shows it for in-progress sessions via existing 3s poll. |
| 12 | Diff command | Card resume row also offers copyable `git -C <project> diff` scoped to the session's changed files. Full diff viewer deliberately skipped. |

Order: 1+2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. Tests for every non-trivial
branch (auth check, remember logic, archive path-safety, tail path-validation, launch
input validation). `npm test` + `npm run build` green before each commit.
