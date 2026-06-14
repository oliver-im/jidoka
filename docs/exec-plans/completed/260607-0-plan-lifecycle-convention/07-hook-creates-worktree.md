# Unit 07 — Hook creates the worktree + plan branch on materialize

**Blocked by:** 06
**Agents involved:** main only
**Topology:** none

## Summary

Close the enforcement loop: when `git_workflow` is on, the ExitPlanMode/materialize hook creates `worktrees/<plan-id>/` on branch `plan/<plan-id>` as it lands the plan, and materializes into it (pure-worktree). The worktree is then guaranteed to exist when work starts. The hook can't change the agent's CWD, so this enforces the *scaffolding*; the rendered `## Git workflow` (Unit 06) tells the agent to `cd` into it.

### Tasks

- `ts/hook.ts` (+ `ts/materialize.ts` as needed): when `cfg.git_workflow` is on —
  - **Anchor to the main checkout, not the caller's CWD.** `hook.ts:54` resolves `plansRoot` from `projectDir = CLAUDE_PROJECT_DIR ?? cwd()`; if the agent invokes `/jidoka` from *inside* an existing worktree, that's the wrong root. Resolve the main checkout via `git rev-parse --git-common-dir` (→ its parent) and create `worktrees/` + scan the daily counter there, so a new plan never nests under another plan's worktree.
  - **Derive the id before naming the branch.** Call `resolveTargetDir` against the main-checkout `plansRoot` first to get `<plan-id>` (slug + counter `N`), *then* `git worktree add worktrees/<plan-id> -b plan/<plan-id>` and materialize into the worktree's `docs/exec-plans/active/<plan-id>/` — nothing committed to `main`.
  - **Already-in-a-worktree:** if the resolved main checkout already has a worktree or branch for this plan-id, fall back gracefully (below) rather than erroring.
- **Always exit 0 / graceful fallback:** not-a-git-repo, worktree-exists, branch-exists, or any git failure → log to stderr, fall back to materializing in the normal in-tree location, exit 0. Never block ExitPlanMode (the renderer's cardinal rule).
- Emit a clear stderr pointer: `Plan materialized at worktrees/<plan-id>/ — cd there to work.` (the agent's cue, since the hook can't cd it).
- **Manual operator step (out-of-repo, NOT a review gate):** set gyuri's global `~/.claude/plugins/jidoka/config.json` `git_workflow: true` (shipped default stays `false`). Same file Unit 03 set `plan_dir_root` in — final global state = `{ plan_dir_root: "docs/exec-plans/active", git_workflow: true, … }`. Invisible to `/code-review`, so it's a step to *do*, not a gated criterion.
- Tests in `ts/__tests__/`: worktree created when flag on + a git repo; graceful fallback (flag on, not a git repo → normal materialize, exit 0); flag off → no worktree; **invoked from inside an existing worktree → resolves the main checkout, no nested worktree.** Use a temp-git-repo fixture.
- `npm run build` + `npm test`.

### Acceptance

- With `git_workflow` on in a git repo, materializing a plan creates `worktrees/<plan-id>/` on `plan/<plan-id>` with the plan dir inside; stderr prints the cd pointer.
- Every failure mode falls back to a normal materialize and exits 0 (tested).
- Shipped default `git_workflow` is `false`. _(gyuri's global `true` is a manual operator step, not a gated criterion.)_ Invoking the hook from within an existing worktree resolves the main checkout and does not nest a worktree (tested).
- `npm test` green; `dist/cli.js` rebuilt.

### Notes

- Pure-worktree: `active/` on `main` stays empty; `git worktree list` is the active-plan index; `main` gains `completed/` plans via `--no-ff` merge.
- Heaviest unit (hook git ops + edge cases). If review surfaces too much, it's the natural one to split into a fast-follow plan — but the intent is to ship the complete story here.
- The hook guarantees the worktree *exists*; "work in it" stays an instruction (Unit 06's rendered block + the resume protocol). That's the deliberate enforcement boundary.
