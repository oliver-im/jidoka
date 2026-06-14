# Unit 03 — Wire the exec-plans lifecycle

**Blocked by:** 01
**Agents involved:** main only
**Topology:** none

## Summary

Make `completed/` a real in-repo archive (de-symlink `notes/done`), seed it with the `260514` plan as a stamped record, point jidoka at `active/`, and write the resume protocol — now including the **pure-worktree git workflow** — into `docs/exec-plans/AGENTS.md`. Then dissolve the leftover `notes/`.

### Tasks

- Remove the `notes/done` symlink (→ external vault). `docs/exec-plans/completed/` is the archive now — in git, agent-legible.
- Seed the archive: restore `260514-0-configurable-user-scoped-review-pipeline/` from history (`git checkout 825efb5~1 -- plan/260514-…`) into `docs/exec-plans/completed/260514-…/`; prepend a provenance stamp to its `progress.md` (`STATUS: completed · 2026-05 · realized-by <commit range>`). Leave Rust-era `260505` in history.
- **Manual operator step (out-of-repo, NOT a review gate):** set the global `~/.claude/plugins/jidoka/config.json` `plan_dir_root` → `docs/exec-plans/active` — set it *explicitly* rather than dropping the key, since the shipped default isn't live globally until Unit 04's `dist/cli.js` ships (dropping it would leave a window of ambiguous resolution). Unit 07 later adds `git_workflow: true` to this same file; final global state = `{ plan_dir_root: "docs/exec-plans/active", git_workflow: true, … }`. Invisible to `/code-review` — a step to *do*, not an acceptance criterion to gate on.
- Write `docs/exec-plans/AGENTS.md` — the resume protocol — seeded from the retiring `notes/plan/AGENTS.md`, updated for:
  - **Lifecycle:** `ideas → active (in a worktree) → completed (on main, via merge)`; `git worktree list` is the active-plan index.
  - **Per-plan worktree:** `worktrees/<plan-id>/` on branch `plan/<plan-id>`.
  - **Per-unit branch:** `unit/NN-slug` off the plan branch → `/code-review` on `plan/<id>..HEAD` → fix → `git merge --squash` to the plan branch as one `Unit NN` commit → delete branch → advance cursor.
  - **Archive + merge:** final step `git mv active/<plan> completed/<plan>` + stamp, commit on the plan branch, then `git checkout main && git merge --no-ff plan/<plan-id>`; `git worktree remove`.
- Update root `AGENTS.md` (~line 16): "Active plans live in worktrees under `docs/exec-plans/active/`; see `docs/exec-plans/AGENTS.md` (resume protocol + git workflow) and `docs/CONVENTION.md` (the lifecycle)."
- Remove the remaining `notes/` scaffolding (`notes/AGENTS.md`, `notes/CLAUDE.md`, empty `notes/plan/`) — content has moved to `docs/`.

### Acceptance

- `notes/` is gone; no `notes/done` symlink; `docs/exec-plans/completed/260514-…/progress.md` shows the stamp.
- `docs/exec-plans/AGENTS.md` documents the lifecycle **and** the pure-worktree git workflow (worktree per plan, branch per unit, squash, `--no-ff` merge).
- _(Manual, non-gated — operator-verified, not part of the unit-diff review:)_ the global config `plan_dir_root` is set to `docs/exec-plans/active`.
- `rg -n 'notes/(plan|done|research)' . -g '!docs/exec-plans/**'` returns nothing load-bearing.

### Notes

- Pure-worktree: the plan dir lives in `active/` *inside its worktree*, not on `main`; `main` only ever shows `completed/`. `active/index.md` on `main` (from Unit 01) says exactly this.
- `docs/CONVENTION.md` doesn't exist until Unit 05 — the AGENTS.md pointer to it is a forward-reference Unit 05 satisfies.
- The hook doesn't *create* the worktree yet (that's Unit 07); this unit documents the workflow that Unit 07 automates.
