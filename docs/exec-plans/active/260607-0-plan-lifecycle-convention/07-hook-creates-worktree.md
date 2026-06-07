# Unit 07 — Hook creates the worktree + plan branch on materialize

**Blocked by:** 06
**Agents involved:** main only
**Topology:** none

## Summary

Close the enforcement loop: when `git_workflow` is on, the ExitPlanMode/materialize hook creates `worktrees/<plan-id>/` on branch `plan/<plan-id>` as it lands the plan, and materializes into it (pure-worktree). The worktree is then guaranteed to exist when work starts. The hook can't change the agent's CWD, so this enforces the *scaffolding*; the rendered `## Git workflow` (Unit 06) tells the agent to `cd` into it.

### Tasks

- `ts/hook.ts` (+ `ts/materialize.ts` as needed): when `cfg.git_workflow` is on, after resolving the plan id, run `git worktree add worktrees/<plan-id> -b plan/<plan-id>` and materialize the plan dir **into the worktree's** `docs/exec-plans/active/<plan-id>/` — nothing committed to `main`.
- **Always exit 0 / graceful fallback:** not-a-git-repo, worktree-exists, branch-exists, or any git failure → log to stderr, fall back to materializing in the normal in-tree location, exit 0. Never block ExitPlanMode (the renderer's cardinal rule).
- Emit a clear stderr pointer: `Plan materialized at worktrees/<plan-id>/ — cd there to work.` (the agent's cue, since the hook can't cd it).
- Set gyuri's global `~/.claude/plugins/planview/config.json` `git_workflow: true`; keep the shipped default `false`. _(Global change, per the `260605` precedent.)_
- Tests in `ts/__tests__/`: worktree created when flag on + a git repo; graceful fallback (flag on, not a git repo → normal materialize, exit 0); flag off → no worktree. Use a temp-git-repo fixture.
- `npm run build` + `npm test`.

### Acceptance

- With `git_workflow` on in a git repo, materializing a plan creates `worktrees/<plan-id>/` on `plan/<plan-id>` with the plan dir inside; stderr prints the cd pointer.
- Every failure mode falls back to a normal materialize and exits 0 (tested).
- Shipped default `git_workflow` is `false`; gyuri's global is `true`.
- `npm test` green; `dist/cli.js` rebuilt.

### Notes

- Pure-worktree: `active/` on `main` stays empty; `git worktree list` is the active-plan index; `main` gains `completed/` plans via `--no-ff` merge.
- Heaviest unit (hook git ops + edge cases). If review surfaces too much, it's the natural one to split into a fast-follow plan — but the intent is to ship the complete story here.
- The hook guarantees the worktree *exists*; "work in it" stays an instruction (Unit 06's rendered block + the resume protocol). That's the deliberate enforcement boundary.
