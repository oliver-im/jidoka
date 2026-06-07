# 260607-0-plan-lifecycle-convention — Progress

**Cursor:** 01-scaffold-docs-skeleton (not started).

## Pre-execution review

Before starting the first unit, run these against the freshly materialized plan dir:

- [ ] `/planview:pre-plan-review`

## Git workflow

This plan follows the pure-worktree discipline it introduces (hand-applied until Units 06–07 teach the tool to emit/enforce it):

- **Bootstrap — the first execution step, before Unit 01.** This plan dir is currently **uncommitted in the main checkout** at `docs/exec-plans/active/260607-0-plan-lifecycle-convention/`, and no worktree exists yet. To start:
  1. `git worktree add worktrees/260607-0-plan-lifecycle-convention -b plan/260607-0-plan-lifecycle-convention` (off `main` @ `825efb5`).
  2. Move this uncommitted plan dir into the worktree at the same path (`docs/exec-plans/active/260607-0-…/`); then remove the now-empty `docs/exec-plans/` from the **main** checkout (keep `docs/*.md`).
  3. In the worktree, commit it on the plan branch: `Plan: plan-lifecycle-convention`.
  4. All further work happens **inside** `worktrees/260607-0-plan-lifecycle-convention/`.
- **Per unit:** branch `unit/NN-slug` off the plan branch → work + run `/code-review` on `plan/260607-0-…..HEAD`, fix flags, commit freely → `git merge --squash unit/NN-slug` into the plan branch as one `Unit NN: <title>` commit → `git branch -D unit/NN-slug` → advance the cursor below.
- **At the end:** `git mv` the plan dir `active/ → completed/` (add the `STATUS: completed · … · realized-by …` stamp), commit, then `git checkout main && git merge --no-ff plan/260607-0-plan-lifecycle-convention`; `git worktree remove worktrees/260607-0-…`.
- `active/` on `main` stays empty; `git worktree list` is the active-plan index; `main` only ever gains `completed/`.

## Done

_Nothing yet._

## Blockers

_None._

## Notes

- **Post-compaction resume:** read this file first. State = plan authored (7 units), **not committed, no worktree yet**. Do the Bootstrap under `## Git workflow`, then the Pre-execution review, then Unit 01.
- When resuming mid-plan, read this file to find the cursor unit, then read the cursor unit's md. Skip `overview.md` unless it's your first session on the plan.
- Work one unit at a time. After finishing the cursor unit, run its review (on the `unit/NN` branch diff), squash-merge it, then update this file: move the unit into Done with a one-liner and advance the cursor.
- Stop after each unit. Surface a brief summary and wait for explicit go-ahead before the next unit. If blocked, record it under Blockers and stop without advancing.
- **Hand-bootstrapped** (the plan creates the structure + workflow it lives in), like `260505` before the renderer existed — so this dir was authored by hand; formatting may differ slightly from tool output, and Units 06–07 are what teach the tool to emit/enforce this workflow.

## Plan-level review

After the last unit's review lands and is committed, run these against the cumulative plan diff:

- [ ] `/planview:plan-review-prompt`
