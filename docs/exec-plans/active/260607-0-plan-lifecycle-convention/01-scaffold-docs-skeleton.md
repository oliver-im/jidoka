# Unit 01 — Scaffold the docs/ lifecycle skeleton

**Blocked by:** none
**Agents involved:** main only
**Topology:** none

## Summary

Lay down the three-kind directory skeleton under `docs/`, with a self-documenting `index.md` in **every** directory stating what kind of artifact lives there, its drift rule, and its naming. No content moves yet — this unit establishes the structure and the convention text that makes each location legible on its own.

### Tasks

- Create the tree, each dir with its own `index.md` (the index doubles as the dir's docs *and* keeps an otherwise-empty dir tracked — so **no `.gitkeep`**; git just needs a real file):
  - `docs/ideas/index.md` — open-ended explorations / problem analysis; may drift (the folder name is the disclaimer); graduates to a plan or a decision, or gets pruned.
  - `docs/exec-plans/index.md` — scoped work; the `active → completed` lifecycle; status = location.
  - `docs/exec-plans/active/index.md` — in-flight plans; under the pure-worktree workflow these live in `worktrees/<plan-id>/`, so on `main` this dir stays empty and `git worktree list` is the active index; one dir per plan (`YYMMDD-N-slug/`).
  - `docs/exec-plans/completed/index.md` — finished plans; frozen records, provenance-stamped on archive.
  - `docs/design-docs/index.md` — settled "why" (current truth until reversed); also the catalog of decisions (filled in Unit 02).
  - `docs/design-docs/superseded/index.md` — reversed decisions, kept as record.
- State the **naming rule** in the relevant indexes: `ideas/` and `exec-plans/*` use `YYMMDD-N-slug` (shared daily counter `N`; an idea keeps its id when promoted to a plan, file → dir); `design-docs/` are topic-named with date/status in a header.
- Give each index a one-paragraph header naming the kind + the rule (open / scoped / settled), so an agent landing in any dir reads its status for free.

### Acceptance

- The tree matches `docs/{ideas/, exec-plans/{active/, completed/}, design-docs/{, superseded/}}`, and **every** directory has an `index.md` (no `.gitkeep` anywhere).
- Each index names its artifact kind, drift rule, and (where relevant) the naming convention in its first paragraph.
- No content moved yet (Units 02–03 do that); only skeleton + indexes.

### Notes

- `docs/exec-plans/active/` already exists — this plan dir is its first inhabitant (hand-bootstrapped). Don't recreate or clobber it; its `index.md` sits alongside the `260607-0-…/` plan dir.
- The `index.md`-everywhere choice is deliberate: it serves the agent-legibility thesis (every dir explains itself) and removes the need for content-free `.gitkeep` placeholders.
