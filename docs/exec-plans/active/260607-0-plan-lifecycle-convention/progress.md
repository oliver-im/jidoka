# 260607-0-plan-lifecycle-convention — Progress

**Cursor:** 06-render-git-workflow (next). Units 01–05 done — see Done below.

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

- **Unit 01 — Scaffold the docs/ lifecycle skeleton** (2026-06-07). Created `docs/{ideas, exec-plans/{active,completed}, design-docs/{,superseded}}`, each with a self-documenting `index.md` (kind + drift rule + naming; no `.gitkeep`). Unit review (subagent): 1 MED + 1 LOW, both fixed — `active/index.md` no longer over-claims `git_workflow` enforcement (frames it as documented-not-enforced); `exec-plans/index.md` opener now names the drift rule. Squash-merged as one commit on the plan branch.
- **Unit 02 — Re-home design rationale + fix doc links** (2026-06-07). `git mv`'d 9 research docs into `docs/design-docs/` (topic-named, dates dropped), with `tech-stack.md → superseded/rust-runtime.md` (reversed Rust→TS, stamped); none were still-open ideas, so `ideas/` stays empty. Fixed all cross-doc links + the 3 inbound `developer-guide.md` refs (incl. the `:378` prose reword), wrote the `design-docs/index.md` catalog (8 active + 1 superseded), trimmed two drifted `.rs` refs in `mermaid-rendering.md`, removed top-level `research/`. Unit review (subagent): no material findings. Squash-merged as one commit.
- **Unit 03 — Wire the exec-plans lifecycle** (2026-06-07). De-symlinked `notes/done`; seeded `completed/` with the `260514` review-pipeline plan restored from history + provenance-stamped (first archived record — its `tools`/`review_pipelines` shape was later flattened, a worked example of why the stamp matters); wrote `docs/exec-plans/AGENTS.md` (resume protocol + pure-worktree git workflow); repointed root `AGENTS.md`; fixed the stale `plugin.json` description; **dissolved `notes/` entirely**. Manual operator step (out-of-repo): global `plan_dir_root` → `docs/exec-plans/active`. Unit review (subagent): no material findings. Squash-merged as one commit.
- **Unit 04 — Flip the shipped default + update planview docs/skills** (2026-06-07). Flipped `ts/config.ts` `defaultConfig.plan_dir_root` `plan` → `docs/exec-plans/active` and updated the 6 default-tied test assertions (`config.test.ts` ×4, `cli.smoke.test.ts` ×2); `npm run build` refreshed `dist/cli.js` (1-line semantic change). Swept "default `plan/`" / "commonly `notes/plan/`" path examples across `skills/{setup,plan-review-prompt,pre-plan-review,planview}` + `docs/{data-model,developer-guide,agent-guide}` + `README` (incl. the README tagline, caught by review); added 2 heuristics (reference-don't-paste; `ideas/` promotion) to `skills/planview` + `docs/agent-guide`; recorded the rationale in `docs/design-docs/default-plan-dir-root.md` (+ catalog). Build hygiene: caught worktree-path bundle churn (esbuild embeds module paths) and fixed it by `npm ci`-ing a local `node_modules` so the dist diff is a clean 1 line. Unit review (subagent): 1 HIGH (stale README tagline) fixed, all else clean; `npm test` 313 green. Squash-merged as one commit.
- **Unit 05 — Author the portable CONVENTION.md** (2026-06-07). Wrote `docs/CONVENTION.md` — the standalone, tool-agnostic three-kind lifecycle (the three kinds + the question each answers, status-as-location, the funnel, the two rules, an adopt-in-a-new-repo recipe, and a clearly-optional execution-workflow + tooling section). **Closes the `CONVENTION.md` forward-refs** from root `AGENTS.md` + `docs/exec-plans/AGENTS.md`; added `CONVENTION.md` to the root `AGENTS.md` reference-docs map; recorded the carrier decision (bundle in planview, copy-to-adopt; no separate `plan-lifecycle` repo yet) in `docs/design-docs/convention-carrier.md` (+ catalog). Unit review (subagent): 1 MED fixed (the adopt-recipe's self-`cp` → a `curl` fetch so the standalone-adoption path actually works); 1 informational (superseded-stamp coverage) dispositioned by-design (plans only archive to `completed/`; superseding is a design-docs transition). Squash-merged as one commit.

## Blockers

_None._

## Notes

- **Post-compaction resume:** read this file first. State (2026-06-07) = bootstrap **done**, pre-execution review **done**, **Units 01–05 done** (squash-merged on the plan branch). **Next action = Unit 06 — Render the `## Git workflow` block into `progress.md`** (first of the two tooling units: adds the `git_workflow` config key + a render block; the known hazard is threading the new key through `mergeForWrite` *and* the `setup` skill's key list + JSONC template, or it's silently dropped on the config round-trip — see the Unit 06 md). On a `unit/06-…` branch inside `worktrees/260607-0-plan-lifecycle-convention/`. Do NOT re-run the Bootstrap or pre-review.
- **Worktree build note (from Unit 04):** the worktree now has a local `node_modules` (via `npm ci`). Keep running `npm run build` / `npm test` **inside the worktree** — esbuild embeds module paths into `dist/cli.js`, so building without a local `node_modules` (resolving up to `../../node_modules`) churns ~98 cosmetic lines in the bundle. Units 06–07 rebuild the bundle; build in-worktree to keep the dist diff to the real change.
- **Pre-execution review dispositions (2026-06-07), all applied:** _(HIGH)_ thread `git_workflow` through `mergeForWrite` + the `setup` skill so it survives the config round-trip → folded into **Unit 06**; _(HIGH)_ this file's Bootstrap state was stale → updated above. _(MED)_ `developer-guide.md:378`'s `research/` prose collides with Unit 02's grep → **Unit 02** reworded + acceptance tightened; _(MED)_ hook worktree-root / id-order / already-in-a-worktree under-specified → **Unit 07** expanded; _(MED)_ out-of-repo global-config edits were unverifiable gates → **Units 03/07** relabel them as manual operator steps. _(LOW)_ Unit 01's `active/index.md` asserted the workflow as fact → **Unit 01** softened to "intended (see AGENTS.md)".
- When resuming mid-plan, read this file to find the cursor unit, then read the cursor unit's md. Skip `overview.md` unless it's your first session on the plan.
- Work one unit at a time. After finishing the cursor unit, run its review (on the `unit/NN` branch diff), squash-merge it, then update this file: move the unit into Done with a one-liner and advance the cursor.
- Stop after each unit. Surface a brief summary and wait for explicit go-ahead before the next unit. If blocked, record it under Blockers and stop without advancing.
- **Hand-bootstrapped** (the plan creates the structure + workflow it lives in), like `260505` before the renderer existed — so this dir was authored by hand; formatting may differ slightly from tool output, and Units 06–07 are what teach the tool to emit/enforce this workflow.

## Plan-level review

After the last unit's review lands and is committed, run these against the cumulative plan diff:

- [ ] `/planview:plan-review-prompt`
