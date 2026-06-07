# 260607-0-plan-lifecycle-convention — Progress

**Cursor:** 01-scaffold-docs-skeleton (next — bootstrap + pre-execution review done; see below).

## Pre-execution review

Run against the freshly materialized plan dir before Unit 01:

- [x] `/planview:pre-plan-review` — ran 2026-06-07 (independent subagent, read-only). Verdict: **Revise before execution** (2 HIGH · 3 MED · 1 LOW). All six findings adjudicated against the code and folded into the plan before Unit 01 — dispositions logged under Notes.

## Git workflow

This plan follows the pure-worktree discipline it introduces (hand-applied until Units 06–07 teach the tool to emit/enforce it):

- **Bootstrap — DONE (2026-06-07).** Worktree `worktrees/260607-0-plan-lifecycle-convention/` is live on branch `plan/260607-0-plan-lifecycle-convention` (off `main` @ `825efb5`; `/worktrees/` is gitignored, so `main` stays clean). The plan dir was moved out of the main checkout into the worktree and committed there as `4538948 Plan: plan-lifecycle-convention`; `main` is untouched at `825efb5`. **All further work happens inside `worktrees/260607-0-plan-lifecycle-convention/`** — do not re-run these steps.
- **Per unit:** branch `unit/NN-slug` off the plan branch → work + run `/code-review` on `plan/260607-0-…..HEAD`, fix flags, commit freely → `git merge --squash unit/NN-slug` into the plan branch as one `Unit NN: <title>` commit → `git branch -D unit/NN-slug` → advance the cursor below.
- **At the end:** `git mv` the plan dir `active/ → completed/` (add the `STATUS: completed · … · realized-by …` stamp), commit, then `git checkout main && git merge --no-ff plan/260607-0-plan-lifecycle-convention`; `git worktree remove worktrees/260607-0-…`.
- `active/` on `main` stays empty; `git worktree list` is the active-plan index; `main` only ever gains `completed/`.

## Done

_Nothing yet._

## Blockers

_None._

## Notes

- **Post-compaction resume:** read this file first. State (2026-06-07) = bootstrap **done** (worktree live, plan committed at `4538948`) and pre-execution review **done** (verdict: revise; fixes folded in). **Next action = Unit 01**, on a `unit/01-…` branch inside `worktrees/260607-0-plan-lifecycle-convention/`. Do NOT re-run the Bootstrap or the pre-review.
- **Pre-execution review dispositions (2026-06-07), all applied:** _(HIGH)_ thread `git_workflow` through `mergeForWrite` + the `setup` skill so it survives the config round-trip → folded into **Unit 06**; _(HIGH)_ this file's Bootstrap state was stale → updated above. _(MED)_ `developer-guide.md:378`'s `research/` prose collides with Unit 02's grep → **Unit 02** reworded + acceptance tightened; _(MED)_ hook worktree-root / id-order / already-in-a-worktree under-specified → **Unit 07** expanded; _(MED)_ out-of-repo global-config edits were unverifiable gates → **Units 03/07** relabel them as manual operator steps. _(LOW)_ Unit 01's `active/index.md` asserted the workflow as fact → **Unit 01** softened to "intended (see AGENTS.md)".
- When resuming mid-plan, read this file to find the cursor unit, then read the cursor unit's md. Skip `overview.md` unless it's your first session on the plan.
- Work one unit at a time. After finishing the cursor unit, run its review (on the `unit/NN` branch diff), squash-merge it, then update this file: move the unit into Done with a one-liner and advance the cursor.
- Stop after each unit. Surface a brief summary and wait for explicit go-ahead before the next unit. If blocked, record it under Blockers and stop without advancing.
- **Hand-bootstrapped** (the plan creates the structure + workflow it lives in), like `260505` before the renderer existed — so this dir was authored by hand; formatting may differ slightly from tool output, and Units 06–07 are what teach the tool to emit/enforce this workflow.

## Plan-level review

After the last unit's review lands and is committed, run these against the cumulative plan diff:

- [ ] `/planview:plan-review-prompt`
