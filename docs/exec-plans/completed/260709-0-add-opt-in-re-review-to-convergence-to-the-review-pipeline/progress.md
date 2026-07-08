> **STATUS: completed · 2026-07 · realized-by `11e2942`→`1664fb4`, landed on `main` via PR.** Added an opt-in *re-review-to-convergence* instruction to jidoka's rendered review sections, gated by a new global-config toggle `review_reconverge` (default on). Unit 01 added the toggle (global-config-only — deliberately excluded from `PROJECT_OVERRIDE_KEYS`, the same boundary as the `*_review` arrays), threaded it config → Plan (materializer-attached, like `git_workflow`) → renderer, added the `renderReReviewNote` helper, and rendered the note into the per-unit `## Review pipeline` section. Unit 02 wired the same helper into the plan-level review block (`buildProgressMd` → `renderPlanReviewBlock`); `pre_review` is deliberately excluded (surface-don't-revise — no fix diff to converge on). Unit 03 documented the toggle (data-model / developer-guide / README / setup SKILL) and flipped `docs/discussions/review-pipeline.md §Re-review to convergence` to Realized. Design (locked in discussion): v0 is **one extra pass, one guardrail** — the reviewer's own middle "should-fix" severity tier (MEDIUM / Major / P1) gates *whether to re-run*, never which findings surface; the unbounded loop + K cap stay deferred. Per-unit reviews (`/code-review` + codex second-opinion) ran per unit; the plan-level review (codex on the cumulative diff) surfaced one MED doc-consistency finding — fixed in `1664fb4` — and its convergence re-run (dogfooding `review_reconverge` itself) came back **No material findings, Ship.**

# 260709-0-add-opt-in-re-review-to-convergence-to-the-review-pipeline — Progress

**Cursor:** all units complete — plan-level review **done (Ship, converged)**; archive + sign-off pending (nothing in flight).

## Pre-execution review

On the first session, before starting Unit 01, the **resuming agent** works through the step(s) below against the freshly materialized plan dir, then **stops** to wait for your go-ahead — it does not roll straight into Unit 01. Follow each step's routing: **auto-run** the agent-invocable ones (the default `/jidoka:pre-plan-review`, or an `exec` template) and surface their findings; for a `print` template or an operator-run slash command, **surface the command and stop** for you to run it:

- [ ] `/jidoka:pre-plan-review`

## Git workflow

This plan is worked in its own git worktree, one branch per unit:

- **Worktree:** `worktrees/260709-0-add-opt-in-re-review-to-convergence-to-the-review-pipeline/` on branch `plan/260709-0-add-opt-in-re-review-to-convergence-to-the-review-pipeline` (off `main`); the plan's `active/` dir lives only inside it.
- **Per unit:** branch `unit/NN-slug` off the plan branch → work + review → `git merge --squash unit/NN-slug` into the plan branch as one `Unit NN: <title>` commit → `git branch -D unit/NN-slug` → advance the cursor.
- **At the end:** `git mv` the plan dir `active/ → completed/` (+ provenance stamp), commit, then `git checkout main && git merge --no-ff plan/260709-0-add-opt-in-re-review-to-convergence-to-the-review-pipeline`, `git worktree remove worktrees/260709-0-add-opt-in-re-review-to-convergence-to-the-review-pipeline`.

## Done

- 01-add-the-review-reconverge-config-toggle-and-render-the-un — `review_reconverge` toggle (default on, global-only) + `renderReReviewNote`; unit `## Review pipeline` renders the note when gated; 212 tests green. (in-tree commit `11e2942`)
- 02-render-the-convergence-note-in-the-plan-level-review-bloc — plan-level block renders the note when gated; pre-execution block abstains; end-to-end re-materialize confirms one occurrence each in the unit md and progress.md; 216 tests green. (in-tree commit `52d15ad`)
- 03-document-the-toggle-and-mark-the-discussion-doc-realized — data-model.md / developer-guide.md / README.md / setup SKILL.md document `review_reconverge`; review-pipeline.md Status flipped to Realized; 216 tests green. (in-tree commit `0103840`)

## Remaining (awaiting your sign-off)

- **Plan-level review** (`plan_review` = agent-run `codex exec`): **done.** Ran `/jidoka:plan-review-prompt` → `codex exec -s read-only` on `5066f5f..HEAD`. First pass: 1 MED finding (the global-only toggle was documented inconsistently — developer-guide config table missing the row, README/SKILL ambiguous on the write location). Fixed in `1664fb4`. Convergence re-run (dogfooding `review_reconverge`) on the post-fix diff: **No material findings — Ship.**
- **Archive**: on sign-off, `mv active/ → completed/` + provenance stamp `> STATUS: completed · 2026-07 · realized-by 11e2942..1664fb4`, update `completed/index.md`.
- **Land**: this is on feature branch `docs/review-to-convergence` (in-tree, not the worktree flow — the hook didn't fire). Push + PR needs your explicit go.

## Blockers

_None._

## Notes

- When resuming, read this file first to find the cursor unit, then read the cursor unit's md. Skip `overview.md` unless this is the first session on the plan.
- On the **first session**, run the Pre-execution review checklist above before starting the cursor unit. Surface findings and revise the plan if anything material lands.
- Work one unit at a time. After finishing the cursor unit, run its review steps, then update this file: move the unit into Done with a one-liner and advance the cursor to the next unit id.
- Stop after each unit. Surface a brief summary to the user and wait for explicit go-ahead before starting the next unit. If the unit is blocked, record it under Blockers and stop without advancing the cursor.

## Plan-level review

After the last unit's review lands and is committed, run the **`/jidoka:plan-review-prompt`** composer against the cumulative plan diff — don't run the vehicle(s) below directly. The composer aims a cross-unit focus and drives whatever is configured: it injects jidoka's own plan-level review prompt into a `{ run, mode }` template (then `print`/`exec` per its mode), or composes the focus into a slash command for you. Configured vehicle(s):

- [x] `codex exec -s read-only "{focus}"` — **exec**: ran via Bash on `5066f5f..HEAD`. 1st pass → 1 MED (doc-consistency for the global-only toggle), fixed in `1664fb4`; convergence re-run → **No material findings, Ship.**

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
