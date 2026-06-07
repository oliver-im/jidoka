# Unit 06 — Render the `## Git workflow` block into progress.md

**Blocked by:** 05
**Agents involved:** main only
**Topology:** none

## Summary

Make planview inject the execution workflow at the point of use: every materialized `progress.md` gains a `## Git workflow` section (worktree per plan, branch per unit, squash, `--no-ff` merge), so the executing agent reads the steps where it works — not in a doc it might never open. Mirrors how `pre_review` / `plan_review` are already rendered. Introduces the `git_workflow` config flag.

### Tasks

- `ts/config.ts`: add a `git_workflow: boolean` config key, `defaultConfig.git_workflow = false` (shipped **off** — OSS opt-in), plus its Zod schema entry. (gyuri's global config sets it `true`; do that in Unit 07 alongside the hook wiring, or here if convenient.)
- `templates/progress.md.eta`: add a `<%= it.gitWorkflowBlock -%>` slot (after the pre-review block, before `## Done`).
- `ts/render-md.ts`: add `renderGitWorkflowBlock(planId, enabled)` and thread it through `buildProgressMd` (mirror `renderPreReviewBlock`/`renderPlanReviewBlock`). When on, emit the worktree/branch/squash/merge steps with the actual `<plan-id>` substituted; when off, emit nothing (or a one-line `_No git workflow configured._`).
- `ts/__tests__/{render-md,materialize}.test.ts`: assert the block renders with the substituted plan id when `git_workflow` is on, and is absent when off; add a `defaultConfig.git_workflow === false` assertion.
- `npm run build` + `npm test`.

### Acceptance

- With `git_workflow` on, a freshly materialized plan's `progress.md` contains a `## Git workflow` section with the plan id substituted; with it off, the section is absent.
- `defaultConfig.git_workflow` is `false`; tests cover on/off.
- `npm test` green; `dist/cli.js` rebuilt.

### Notes

- This is the *instruction* half of enforcement; Unit 07 is the *scaffolding* half (the hook actually creates the worktree). The flag introduced here gates both.
- Keep the rendered text terse — it's a reminder, not the spec. Point at `docs/exec-plans/AGENTS.md` + `docs/CONVENTION.md` for the full version.
