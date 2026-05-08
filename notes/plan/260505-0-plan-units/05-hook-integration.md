# Unit 05 — Hook integration update

**Blocked by:** 03, 04
**Agents involved:** main only
**Topology:** none

## Goal

ExitPlanMode hook reads Plan JSON from `/tmp/planview-{session_id}.json`, materializes the plan dir (unit 03), generates `overview.html` (unit 04), opens browser. Auto-invokes via deny-with-instruction when JSON missing or wrong shape.

## Tasks

### Update `src/hook.rs`

- Hook reads `/tmp/planview-{session_id}.json` as today.
- Deserialize as `Plan`. If success, materialize.
- If Plan deserialization fails (malformed JSON, or a different shape such as Topology), treat as missing and deny with the existing "you must run /planview before exiting plan mode" instruction. The hook is Plan-only; the standalone CLI (`planview <file>` or stdin) still accepts Topology for direct rendering — users who want topology-only output don't go through the hook.

### Project root resolution

- `$CLAUDE_PROJECT_DIR` is the project root. Use it when computing `plans_root`. Fall back to PWD with a stderr warning if unset (claude-code issue [#22343](https://github.com/anthropics/claude-code/issues/22343)).

### Materialize flow

- Compute target plan dir via `resolve_target_dir` (unit 03).
- If target exists: deny with `"Plan dir <path> already exists. Either remove it or pick a new slug via /planview."` (No `--force` in v1.)
- Otherwise: materialize markdown files (unit 03), render overview.html (unit 04), open browser (existing rules).
- After successful materialization: stderr line `Wrote plan to <path>` so the user sees the target.

### Always exit 0

- Existing invariant. Confirm every error branch maps to either a deny-with-instruction (which still exits 0) or a silent-fall-through (also exits 0).
- Lint: any `?` in hook code paths must terminate at a top-level swallow (`let _ = ... .ok();` or explicit match), not propagate to `main`.

### Marker file (existing pattern)

- `/tmp/planview-{session_id}.attempted` tracks deny count, max 3. Reuse as-is. Increment on every deny; reset on successful materialize.

### Tests

Extend `tests/cli_test.rs` (the existing hook tests live here; or split out `tests/hook_test.rs`):

- Fixture stdin JSON → expected stdout/stderr/exit-code behavior.
- Plan JSON missing → deny with instruction, exit 0.
- Plan JSON valid → materialize-and-render path, exit 0.
- Topology JSON (or any non-Plan shape) in /tmp → deny with the standard "run /planview" instruction, exit 0.
- Target dir exists → deny, exit 0.
- Marker count 3 → silent fall-through, exit 0.
- Plan validation error inside the hook → deny with the validation error message, exit 0.

## Acceptance

- All hook tests pass.
- End-to-end manual smoke in a real Claude Code session:
  - Enter plan mode, write a plan, run `/planview`, exit plan mode → dir materializes, browser opens (when `PLANVIEW_NO_OPEN` unset).
  - Without running `/planview`, exit plan mode → deny fires, agent runs `/planview`, retry succeeds.

## Review

- [ ] Local: `/code-review:code-review`
- [ ] Agent CLI: focus on the always-exit-0 invariant — any new path that could panic or return non-zero is a regression
- [ ] Manual smoke per acceptance
- [ ] Commit
- [ ] Update progress.md cursor → unit 06
