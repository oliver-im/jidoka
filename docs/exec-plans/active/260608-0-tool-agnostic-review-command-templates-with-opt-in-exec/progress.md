# 260608-0-tool-agnostic-review-command-templates-with-opt-in-exec — Progress

**Cursor:** 05-generalize-the-plan-review-prompt-composer (not started).

## Pre-execution review

Before starting the first unit, run these against the freshly materialized plan dir:

- [x] `/planview:pre-plan-review` — ran 2026-06-08; 3 MED + 1 LOW findings (invocation-model clarity, rendered pre_review framing, stage-scoped placeholders + substitution ownership, Unit 04 independence), all folded into Units 01–04 + 07. No blockers; "Review and decide".

## Git workflow

This plan is worked in its own git worktree, one branch per unit. Full steps: `docs/exec-plans/AGENTS.md` + `docs/CONVENTION.md`.

- **Worktree:** `worktrees/260608-0-tool-agnostic-review-command-templates-with-opt-in-exec/` on branch `plan/260608-0-tool-agnostic-review-command-templates-with-opt-in-exec` (off `main`); the plan's `active/` dir lives only inside it.
- **Per unit:** branch `unit/NN-slug` off the plan branch → work + review → `git merge --squash unit/NN-slug` into the plan branch as one `Unit NN: <title>` commit → `git branch -D unit/NN-slug` → advance the cursor.
- **At the end:** `git mv` the plan dir `active/ → completed/` (+ provenance stamp), commit, then `git checkout main && git merge --no-ff plan/260608-0-tool-agnostic-review-command-templates-with-opt-in-exec`, `git worktree remove worktrees/260608-0-tool-agnostic-review-command-templates-with-opt-in-exec`.

## Done

- **01 — Pin the design in review-pipeline.md** — appended the superseding decision block to `docs/design-docs/review-pipeline.md` (supersedes #6, refines #5; the 4 decisions + two-mechanism invocation model + stage-scoped placeholders + boundaries), and marked #5/#6 with superseded/refined pointers. Design-only, no code. Unit review `/code-review`: (none).
- **02 — Generalize reviewCommandSchema (schema + config)** — `reviewStepSchema` is now a union of slash-command string OR `{ run, mode }` template (`mode` defaults `print`; `strictObject` rejects unknown keys); added `ReviewStep`/`ReviewStepMode` types + `reviewStepLabel` helper. `Config`/`Unit`/`Plan` review fields → `ReviewStep[]`; render-md.ts + html.ts bridged via `.map(reviewStepLabel)` (proper mode rendering deferred to Unit 03 — noted forward-ref). Project-override security boundary still excludes review arrays (existing test at config.test.ts:232). +12 schema/label/loader tests. `npm run typecheck`/`test` (339 pass)/`build` green; `dist/cli.js` rebuilt. Unit review `/code-review` (medium, independent agent): `[]`.
- **03 — Record + render the template form and its mode** — renderer now carries `ReviewStep` through unchanged and renders template objects as their `run` text + an unambiguous `**print**`/`**exec**` mode badge in the per-unit `## Review pipeline`, `## Plan-level review`, and `## Pre-execution review` blocks; reframed the pre-execution block to state the **resuming agent** auto-runs it on the first session then **stops** before Unit 01 (no longer a passive operator checklist). A pending-substitution note appears only when a template mentions a known placeholder. Renderer still records only — substitutes/executes nothing. Code-review gate (independent `feature-dev:code-reviewer`) found 2 real output-integrity bugs in the new template form + 1 false-positive; all fixed: GFM-safe `mdInlineCode` (backtick in `run` can't garble the span), pipe-escape in the overview table cell, and anchored placeholder detection via `REVIEW_PLACEHOLDERS` (single source of truth in types.ts; `awk '{print}'` no longer false-positives). +8 render/materialize tests (347 pass). `typecheck`/`test`/`build` green; `dist/cli.js` rebuilt.
- **04 — Author planview's own plan-level review prompt** — added `skills/plan-review-prompt/plan-review.prompt.md`: a self-contained, **tooless** hostile reviewer prompt planview owns, aimed at the cumulative committed diff as one integrated change (cross-unit seams, deferred forward-references, spanning invariants, riskiest/most-coupled changes, claimed-vs-delivered coverage gaps). Mirrors `pre-plan-review`'s structure but for a diff; explicitly **not** vendored from codex's runtime-failure-shaped prompt. Prose asset only — no code, tests unaffected (347 pass). Intentionally unreferenced until Unit 05 wires it in. Review gate (independent `feature-dev:code-reviewer`): one real self-containment gap — the prompt assumed unit structure a flat diff doesn't carry — fixed by making the forward-reference/cross-unit checks ordering-independent (defined-but-unconsumed *within the change*), sourcing unit structure from focus/commit-messages with graceful degradation, and dropping the slug heading's filesystem assumption.

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
