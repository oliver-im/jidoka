# exec-plans/ — resume protocol & git workflow

Each directory under `active/` is one plan in progress; `completed/` holds finished plans as frozen records. A plan is a *directory* of markdown (`overview.md`, `progress.md`, `NN-slug.md` units), not a single doc. This file is the operational companion to `../CONVENTION.md` (the portable lifecycle) — it covers **how to resume a plan** and **the git workflow plans are worked in**.

## Layout

```
docs/exec-plans/
  active/<YYMMDD-N-slug>/      # in flight — but see the worktree workflow below
    overview.md                # goal, decisions, unit list, references
    progress.md                # cursor + done/blockers/notes + this plan's git-workflow block
    NN-<unit-slug>.md          # one file per unit, id = filename
  completed/<YYMMDD-N-slug>/    # finished — frozen, provenance-stamped on archive
```

- `YYMMDD` — date the plan was bootstrapped (local time). `N` — daily counter, **shared with `../ideas/`** (scan the live entries — `ideas/`, `active/`, and any in-flight `worktrees/<id>` — for `^<today>-(\d+)-` → max+1; `completed/` isn't rescanned, so an archived id can recur). `slug` — kebab-case, ≤ 60 chars. Unit ids are `^[0-9]{2}-[a-z0-9-]+$`; the unit filename is exactly `<id>.md`.
- New plans are produced by `/planview` and materialized by the ExitPlanMode hook — nothing here is hand-edited except `progress.md` as work proceeds (and plan refinement right after materialization).

## Git workflow (pure-worktree)

A plan is **worked in its own git worktree**, and each **unit is a branch**. The result: `active/` on `main` stays empty, `git worktree list` is the live index of in-flight plans, and `main` only ever gains plans under `completed/` (via merge).

- **Per plan:** `worktrees/<plan-id>/` on branch `plan/<plan-id>`, off `main`. The plan dir lives in `active/<plan-id>/` *inside that worktree*. (Create it by hand with `git worktree add worktrees/<plan-id> -b plan/<plan-id>`; planview can also scaffold it automatically when its `git_workflow` flag is enabled. `worktrees/` is gitignored.)
- **Per unit:** branch `unit/NN-slug` off the plan branch. Do the unit's work there, run the unit review (below) on the branch diff, fix flags, commit freely. Then **squash-merge** into the plan branch as one `Unit NN: <title>` commit (`git merge --squash unit/NN-slug` → commit), delete the unit branch (`git branch -D unit/NN-slug`), and advance the cursor. The squash absorbs the review→fix rounds, so the plan branch carries exactly one clean commit per unit.
- **At the end (archive + merge):** `git mv active/<plan-id> completed/<plan-id>`, prepend the provenance stamp to its `progress.md`, commit on the plan branch; then `git checkout main && git merge --no-ff plan/<plan-id>` and `git worktree remove worktrees/<plan-id>`. `main` gains the plan under `completed/`, never under `active/`.

## Resume protocol

When asked to resume a plan:

1. **Read `progress.md` first.** It carries the cursor (active unit), Done, Blockers, session notes, and this plan's `## Git workflow` block (the worktree/branch state). Don't read other files yet.
2. **Read the cursor unit's md** (`NN-<slug>.md`) — its full task list, acceptance criteria, and review steps. It is meant to be self-sufficient.
3. **Skip `overview.md`** unless this is your first session on the plan or you need the high-level decisions.
4. **Don't read other unit mds** unless the cursor unit references them or you need to verify a `blocked_by` claim.
5. **Work inside the plan's worktree** (`worktrees/<plan-id>/`), on a `unit/NN-slug` branch. If the worktree doesn't exist yet (hand-bootstrapped plan), the `## Git workflow` block in `progress.md` has the bootstrap steps.

After completing the cursor unit:

- Run the **unit-level review** from `progress.md` / the unit md (typically the built-in `/code-review`, sometimes `/simplify`) on the `unit/NN` branch diff. Treat findings as **candidates to triage** against plan context — a flagged "unused" symbol may be an intentional forward-reference a later unit wires up (the unit body should call it out) — not blindly applied.
- Squash-merge the unit branch and update `progress.md`: move the unit into Done with a one-liner, advance the cursor.
- **Stop after each unit.** Surface a brief summary and wait for explicit go-ahead before the next. If blocked, record it under Blockers and stop without advancing.

When the cursor unit was the **last** one:

- After its review + squash-merge, walk `progress.md`'s `## Plan-level review` against the cumulative (committed) plan diff. The recommended entry is `/planview:plan-review-prompt` (agent-invocable) — it reads the plan + diff and composes a ready-to-run `/codex:adversarial-review --base <branch>` command. Surface that command and wait: codex review sets `disable-model-invocation` (you **cannot** invoke it) and needs `/codex:setup` + `codex login`.
- On approval, **archive + merge** per the git workflow above (`git mv` to `completed/`, stamp, `--no-ff` merge to `main`, remove the worktree). Don't archive before sign-off, even if `## Plan-level review` is empty.

## Provenance stamp (on archive)

Prepend to the archived plan's `progress.md`:

```
> STATUS: completed · <YYYY-MM> · realized-by <commit or range>
```

Optionally add one line of context if the code has since evolved past the plan's design (the record stays frozen; the stamp tells the reader how current it is).

## Cross-references

- `../CONVENTION.md` — the portable three-kind lifecycle (ideas / exec-plans / design-docs) and its two rules.
- `index.md` (this dir) and `../{ideas,design-docs}/index.md` — what each kind holds and its drift rule.
- `../agent-guide.md` — what `/planview` emits and the heuristics it follows.
- `../data-model.md` — Plan and Unit schema, plus the per-unit Topology shape.
