# Unit 05 — Author the portable CONVENTION.md

**Blocked by:** 04
**Agents involved:** main only
**Topology:** none

## Summary

Extract the now-working structure into a standalone, repo-agnostic `CONVENTION.md` — the reusable development style to drop into other projects and open-source. Seed it from the retired `notes/AGENTS.md`, rewritten for the three-kind model.

### Tasks

- Write `docs/CONVENTION.md`: the three kinds (ideas / exec-plans / design-docs) and the question each answers; status-as-location; the funnel (`ideas → plan or decision`); the two rules (provenance stamp on archive, reference-don't-paste); and a short "adopt this in a new repo" section (mkdir the tree, drop this file, point your plan tool at `exec-plans/active`).
- Add an **"Execution workflow (recommended, optional)"** section: pure-worktree per plan (`worktrees/<plan-id>/` on `plan/<plan-id>`), branch per unit (`unit/NN-slug`) + squash to the plan branch, `--no-ff` merge to `main`; `git worktree list` as the active index. Mark it clearly as the opinionated execution layer an adopter can skip while keeping the docs structure — and note planview can enforce it via the `git_workflow` flag (rendered block + worktree-creating hook).
- Keep it **tool-agnostic** — planview is one way to materialize/archive plans, not a requirement. Mention it as the reference driver, optional.
- Add a top-level `AGENTS.md` pointer to `docs/CONVENTION.md` (table-of-contents style, per the article's "map not manual"), satisfying Unit 03's forward-reference.
- Record the carrier decision (planview bundles `CONVENTION.md` as a template vs a separate `plan-lifecycle` repo) as a short note in the doc or `design-docs/`.

### Acceptance

- `docs/CONVENTION.md` reads standalone: a newcomer can replicate the structure in another repo from it alone, with no planview-specific steps required.
- Root `AGENTS.md` points to it.
- The three kinds, status-as-location, the funnel, and both rules are all stated.
- The execution-workflow section is present and clearly marked optional.

### Notes

- This is the open-source deliverable — write it for someone who hasn't read the OpenAI piece.
- Closing loop: once this lands, run the plan-level review (`/planview:plan-review-prompt`) on the cumulative diff, then archive `260607-0` itself to `completed/` with a stamp — the convention's first self-application.
