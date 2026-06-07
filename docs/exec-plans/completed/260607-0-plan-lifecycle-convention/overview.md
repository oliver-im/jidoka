# 260607-0-plan-lifecycle-convention — Adopt the docs/ plan-lifecycle convention

## Goal

Migrate planview's planning artifacts into a portable, agent-first three-kind structure under `docs/` — `ideas/` (open), `exec-plans/{active,completed}/` (scoped work), `design-docs/{,superseded}/` (settled why) — so lifecycle status is encoded by directory and completed work stops being mistaken for current truth. A second pillar covers *how work flows through git*: a worktree per plan, a branch per unit. The result doubles as a reusable, open-sourceable development convention.

## Context

Prompted by OpenAI's "Harness engineering" piece (repo as system of record; "what the agent can't see doesn't exist"). An audit found the live failure mode it warns about already in-repo: Rust-era plans describing a now-TypeScript codebase, greppable and unarchived — an agent reading them would be "confidently wrong" (since removed in commit `825efb5`). The SOTA agrees on in-repo + agent-legible but, per Martin Fowler's spec-tool review, leaves the *completed-artifact lifecycle* unsolved — this convention plants a flag there. The organizing insight: carve by **lifecycle status × is-it-current-truth**, which dissolves the ambiguous "research" bucket into ideas / decisions / superseded.

## Decisions (locked, v1)

- **Three kinds as top-level peers under `docs/`; status = location.** `ideas/` (open-ended, may drift), `exec-plans/{active,completed}/` (scoped work, frozen on completion), `design-docs/{,superseded}/` (settled rationale, current truth). An idea funnels into *either* a plan *or* a decision — so it is a peer of both, not a sub-state of exec-plans.
- **Names:** article-aligned (`exec-plans/`, `design-docs/`) for OSS recognizability; the open bucket is `ideas/` (chosen over `explorations/` for brevity).
- **File naming & placeholders.** Temporal kinds — `ideas/` and `exec-plans/{active,completed}/` — use `YYMMDD-N-slug` with a shared daily counter `N`; an idea keeps its identity when it graduates to a plan (file `260607-3-foo.md` → dir `active/260607-3-foo/`). `design-docs/` are **topic-named** (`cli-over-mcp.md`) with date/status in a header — decisions are referenced by subject, not date. Every directory carries a self-documenting `index.md`; no `.gitkeep`.
- **Flip planview's shipped default** `plan_dir_root` `plan` → `docs/exec-plans/active` (Unit 04) — the convention ships batteries-included for every planview user, not just this repo. gyuri's global config moves to it too, ahead of the `~/hhe/` rollout.
- **Seed `completed/` with the `260514` review-pipeline plan**, restored from history and provenance-stamped, as the first record + structure validator. Leave the Rust-era `260505` in git history.
- **Two rules.** On archive, stamp `STATUS: completed · <date> · realized-by <commit>`. In plan/idea bodies, reference code by `path:symbol` — don't paste snippets (artifacts carry durable intent, not freezable code).
- **Execution workflow (pure-worktree).** Each plan is worked in a git worktree — `worktrees/<plan-id>/` on branch `plan/<plan-id>` — so `active/` exists only inside the worktree, `git worktree list` is the live index of in-flight plans, and `main` only ever gains `completed/` plans (via merge). Each **unit is a branch** (`unit/NN-slug`) off the plan branch, squash-merged back as one `Unit NN` commit — this absorbs the review→fix rounds that code review almost always triggers; the plan branch merges to `main` with `--no-ff`. (Supersedes an earlier index-on-main lean: the worktree list is the better active index, and it keeps the hook from auto-committing to `main`.)
- **Enforcement is opinionated on purpose.** A process convention can't be fully *forced* (a hook can't change the agent's CWD), so adherence = reference docs (`CONVENTION.md` + resume protocol) **plus** point-of-use injection: planview renders a `## Git workflow` block into every `progress.md` (Unit 06), and the materialize hook **creates the worktree + plan branch** when a plan lands (Unit 07). Both gated by a `git_workflow` flag — **on** in this repo / gyuri's global, **off** in the shipped default (OSS opt-in) — and the hook is always-exit-0 with graceful fallback. The hook guarantees the worktree *exists*; the rendered block tells the agent to work in it.
- **Code touched is minimal and bounded.** `materialize.ts`'s counter scan is already convention-agnostic (no path-resolution change). The code changes are: the shipped-default constant + tied tests (Unit 04), the `## Git workflow` render block + `git_workflow` flag (Unit 06), and the hook's worktree creation (Unit 07). Everything else is files + prose.

## Out of scope (v1)

- Rolling the convention out to the other `~/hhe/` projects — a **downstream effort**: filed as an `ideas/` entry once Unit 01 creates the bucket, graduating to its own plan after Unit 05 lands `CONVENTION.md` (audit already done: 5 repos with artifacts — `traceclip`, `claude-workflows-viz`, `ait`, `dotfiles`, `video`; the rest inherit lazily via the flipped default).
- Tooling the archive move / provenance stamp (manual `git mv` + edit for now).
- `/goal` integration (already deferred in the review-pipeline research note).

## Unit list

| # | Title | Blocked by | Reviews |
|---|---|---|---|
| 01 | Scaffold the docs/ lifecycle skeleton | — | /code-review |
| 02 | Re-home design rationale + fix doc links | 01 | /code-review |
| 03 | Wire the exec-plans lifecycle | 01 | /code-review |
| 04 | Flip the shipped default + update planview docs/skills | 02, 03 | /code-review |
| 05 | Author the portable CONVENTION.md | 04 | /code-review |
| 06 | Render the `## Git workflow` block into progress.md | 05 | /code-review |
| 07 | Hook creates the worktree + plan branch on materialize | 06 | /code-review |

## Cross-cutting constraints

- **Status is the directory** — never rely on a file's content to know its lifecycle state.
- **Don't garden historical records** (completed plans, superseded decisions) — freezing is the point; only stamp provenance.
- **Keep `CONVENTION.md` tool-agnostic** — planview is one way to drive the lifecycle, not a requirement; the git workflow is a clearly-marked *optional* layer.
- This plan lives in `active/` **inside its worktree** and is the structure's first inhabitant — don't move or clobber it; `main`'s `active/` stays empty.
- Unit work happens on `unit/NN-slug` branches in the plan's worktree, squash-merged to the plan branch (1 commit/unit); the plan branch merges to `main` with `--no-ff`. Never commit unit work straight to `main`.

## References

- OpenAI, "Harness engineering: leveraging Codex in an agent-first world" — the trigger.
- M. Fowler, "Understanding Spec-Driven Development: Kiro, spec-kit, and Tessl" — the unsolved completed-artifact lifecycle.
- traceclip — the existing worktree pattern (`worktrees/<plan-id>/` on `plan/<plan-id>`, `make worktree-setup`) this plan generalizes.
- `notes/research/260605-0-review-pipeline-direction.md` — companion (relocates to `design-docs/review-pipeline.md` in Unit 02).
- `notes/AGENTS.md` + `notes/plan/AGENTS.md` — the retiring naming/archiving + resume conventions that seed `CONVENTION.md` (Unit 05) and `docs/exec-plans/AGENTS.md` (Unit 03).
