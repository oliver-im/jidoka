# 260616-0-excise-the-topology-and-html-rendering-subsystem — Progress

**Cursor:** 02-excise-the-topology-data-model-and-mermaid-renderer (not started).

## Pre-execution review

On the first session, before starting Unit 01, the **resuming agent** works through the step(s) below against the freshly materialized plan dir, then **stops** to wait for your go-ahead — it does not roll straight into Unit 01. Follow each step's routing: **auto-run** the agent-invocable ones (the default `/jidoka:pre-plan-review`, or an `exec` template) and surface their findings; for a `print` template or an operator-run slash command, **surface the command and stop** for you to run it:

- [x] `/jidoka:pre-plan-review` — run twice (initial + re-review after revisions). 1 HIGH (plugin manifests advertised the removed subsystem) + 4 MED gaps surfaced; all folded into Units 04–05 + the overview's cross-cutting constraints. Re-review came back clean (Approve).

## Git workflow

This plan is worked in its own git worktree, one branch per unit. Full steps: `docs/exec-plans/AGENTS.md` + `docs/CONVENTION.md`.

- **Worktree:** `worktrees/260616-0-excise-the-topology-and-html-rendering-subsystem/` on branch `plan/260616-0-excise-the-topology-and-html-rendering-subsystem` (off `main`); the plan's `active/` dir lives only inside it.
- **Per unit:** branch `unit/NN-slug` off the plan branch → work + review → `git merge --squash unit/NN-slug` into the plan branch as one `Unit NN: <title>` commit → `git branch -D unit/NN-slug` → advance the cursor.
- **At the end:** `git mv` the plan dir `active/ → completed/` (+ provenance stamp), commit, then `git checkout main && git merge --no-ff plan/260616-0-excise-the-topology-and-html-rendering-subsystem`, `git worktree remove worktrees/260616-0-excise-the-topology-and-html-rendering-subsystem`.

## Done

- **Unit 01 — Remove the HTML/browser output and topology CLI command** ✅ Deleted `html.ts`/`output.ts`/`schema.ts`/`describe.ts`/`example.ts` + their tests; removed the standalone topology-render CLI command, the HTML render + browser-open path, and the `html_output`/`auto_open_browser`/`plan_level_topology` config flags. Markdown materialize path, hook exit-0 contract, and `isValidId` preserved. Build + 293 tests + typecheck green; `dist/cli.js` rebuilt. Reviews (`/code-review` + codex exec) clean. Squash: `39b1fec`.

## Blockers

_None._

## Notes

- When resuming, read this file first to find the cursor unit, then read the cursor unit's md. Skip `overview.md` unless this is the first session on the plan.
- On the **first session**, run the Pre-execution review checklist above before starting the cursor unit. Surface findings and revise the plan if anything material lands.
- Work one unit at a time. After finishing the cursor unit, run its review steps, then update this file: move the unit into Done with a one-liner and advance the cursor to the next unit id.
- Stop after each unit. Surface a brief summary to the user and wait for explicit go-ahead before starting the next unit. If the unit is blocked, record it under Blockers and stop without advancing the cursor.

## Plan-level review

After the last unit's review lands and is committed, run the **`/jidoka:plan-review-prompt`** composer against the cumulative plan diff — don't run the vehicle(s) below directly. The composer aims a cross-unit focus and drives whatever is configured: it injects jidoka's own plan-level review prompt into a `{ run, mode }` template (then `print`/`exec` per its mode), or composes the focus into a slash command for you. Configured vehicle(s):

- [ ] `codex exec -s read-only "{focus}"` — **exec**: the resuming agent runs this via the Bash tool, then surfaces the findings

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
