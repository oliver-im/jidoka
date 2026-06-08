# 260608-0-tool-agnostic-review-command-templates-with-opt-in-exec — Progress

**Cursor:** 01-pin-the-design-in-review-pipeline-md (not started).

## Pre-execution review

Before starting the first unit, run these against the freshly materialized plan dir:

- [x] `/planview:pre-plan-review` — ran 2026-06-08; 3 MED + 1 LOW findings (invocation-model clarity, rendered pre_review framing, stage-scoped placeholders + substitution ownership, Unit 04 independence), all folded into Units 01–04 + 07. No blockers; "Review and decide".

## Git workflow

This plan is worked in its own git worktree, one branch per unit. Full steps: `docs/exec-plans/AGENTS.md` + `docs/CONVENTION.md`.

- **Worktree:** `worktrees/260608-0-tool-agnostic-review-command-templates-with-opt-in-exec/` on branch `plan/260608-0-tool-agnostic-review-command-templates-with-opt-in-exec` (off `main`); the plan's `active/` dir lives only inside it.
- **Per unit:** branch `unit/NN-slug` off the plan branch → work + review → `git merge --squash unit/NN-slug` into the plan branch as one `Unit NN: <title>` commit → `git branch -D unit/NN-slug` → advance the cursor.
- **At the end:** `git mv` the plan dir `active/ → completed/` (+ provenance stamp), commit, then `git checkout main && git merge --no-ff plan/260608-0-tool-agnostic-review-command-templates-with-opt-in-exec`, `git worktree remove worktrees/260608-0-tool-agnostic-review-command-templates-with-opt-in-exec`.

## Done

_Nothing yet._

## Blockers

_None._

## Notes

- When resuming, read this file first to find the cursor unit, then read the cursor unit's md. Skip `overview.md` unless this is the first session on the plan.
- On the **first session**, run the Pre-execution review checklist above before starting the cursor unit. Surface findings and revise the plan if anything material lands.
- Work one unit at a time. After finishing the cursor unit, run its review steps, then update this file: move the unit into Done with a one-liner and advance the cursor to the next unit id.
- Stop after each unit. Surface a brief summary to the user and wait for explicit go-ahead before starting the next unit. If the unit is blocked, record it under Blockers and stop without advancing the cursor.

## Plan-level review

After the last unit's review lands and is committed, run these against the cumulative plan diff:

- [ ] `/planview:plan-review-prompt`
