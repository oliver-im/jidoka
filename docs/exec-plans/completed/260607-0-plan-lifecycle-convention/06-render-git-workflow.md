# Unit 06 — Render the `## Git workflow` block into progress.md

**Blocked by:** 05
**Agents involved:** main only
**Topology:** none

## Summary

Make jidoka inject the execution workflow at the point of use: every materialized `progress.md` gains a `## Git workflow` section (worktree per plan, branch per unit, squash, `--no-ff` merge), so the executing agent reads the steps where it works — not in a doc it might never open. Mirrors how `pre_review` / `plan_review` are already rendered. Introduces the `git_workflow` config flag.

### Tasks

- `ts/config.ts`: add a `git_workflow: boolean` config key — extend the `Config` interface, `defaultConfig.git_workflow = false` (shipped **off** — OSS opt-in), the `configSchema` Zod entry, **and `mergeForWrite` (it hand-copies each known key one-by-one at `ts/config.ts:197-203`, so a key omitted there is silently dropped on the `setup` round-trip — that's the bug that would later strip gyuri's `git_workflow: true`).** (gyuri's global value is set in Unit 07.)
- **Make `git_workflow` project-overridable** — add it to `PROJECT_OVERRIDE_KEYS` + a boolean-validated branch in `applyProjectOverrides`. Rationale: a committed `.jidoka.json` with `"git_workflow": true` is the natural way an OSS repo opts its whole team into the worktree workflow, cleaner than every contributor hand-editing their global config. _(If global-only is preferred, drop this bullet — but the `mergeForWrite` threading above is non-optional regardless.)_
- `skills/setup/SKILL.md`: add `git_workflow` to the key table, the JSONC template (with an explanatory comment), and bump "all seven top-level keys" (line 14) → eight — otherwise `setup` won't write the key and the questionnaire can't manage it.
- `templates/progress.md.eta`: add a `<%= it.gitWorkflowBlock -%>` slot (after the pre-review block, before `## Done`).
- `ts/render-md.ts`: add `renderGitWorkflowBlock(planId, enabled)` and thread it through `buildProgressMd` (mirror `renderPreReviewBlock`/`renderPlanReviewBlock`). When on, emit the worktree/branch/squash/merge steps with the actual `<plan-id>` substituted; when off, emit nothing (or a one-line `_No git workflow configured._`).
- `ts/__tests__/{render-md,materialize}.test.ts`: assert the block renders with the substituted plan id when `git_workflow` is on, and is absent when off; add a `defaultConfig.git_workflow === false` assertion. `ts/__tests__/config.test.ts`: assert `mergeForWrite` round-trips `git_workflow` (a rewrite preserves it), and — if project-overridable — that `.jidoka.json` can set it and a non-boolean is warn-and-ignored.
- `npm run build` + `npm test`.

### Acceptance

- With `git_workflow` on, a freshly materialized plan's `progress.md` contains a `## Git workflow` section with the plan id substituted; with it off, the section is absent.
- `defaultConfig.git_workflow` is `false`; tests cover on/off. `mergeForWrite` round-trips `git_workflow` and it appears in the `setup` template — a config rewrite never drops it.
- `npm test` green; `dist/cli.js` rebuilt.

### Notes

- This is the *instruction* half of enforcement; Unit 07 is the *scaffolding* half (the hook actually creates the worktree). The flag introduced here gates both.
- Keep the rendered text terse — it's a reminder, not the spec. Point at `docs/exec-plans/AGENTS.md` + `docs/CONVENTION.md` for the full version.
