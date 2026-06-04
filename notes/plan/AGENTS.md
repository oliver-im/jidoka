# planview/notes/plan/ — Active Plans

Each subdirectory under `notes/plan/` is one plan in progress. A plan is a directory of markdown files, not a single doc — see the layout convention below.

## Layout

```
notes/plan/<YYMMDD-N-slug>/
  overview.md            # goal, decisions, unit list, references
  progress.md            # cursor + done/blockers/notes
  0N-<unit-slug>.md      # one file per unit, named with the unit's id
```

- `YYMMDD` — date the plan was bootstrapped (local time).
- `N` — counter that resets per day, shared across `notes/plan/`, `notes/research/`, `notes/backlog/`, and the archived `done/plan/` (per `notes/AGENTS.md`).
- `slug` — kebab-case, ≤ 60 chars, no leading/trailing hyphen.
- Unit ids are `^[0-9]{2}-[a-z0-9-]+$` (e.g. `01-housekeeping`). The unit md filename is exactly `<unit.id>.md`.

Each plan dir is a self-contained working state for the work it tracks. New plans are produced by `/planview` and materialized via the ExitPlanMode hook (the binary writes the dir; nothing in here is hand-edited unless you're refining a plan post-materialization).

## Resume protocol

When a user asks to resume a plan at `notes/plan/<slug>/`:

1. **Read `progress.md` first.** It carries the current cursor (which unit is active), what's done, blockers, and any session notes. Don't read other files yet.
2. **Read the cursor unit's md** (`0N-<slug>.md`). That file has the full task list, acceptance criteria, and review steps for the active step.
3. **Skip `overview.md`** unless this is your first session on the plan or you need the high-level decisions context — the cursor unit md is intended to be self-sufficient.
4. **Do not read other unit mds** unless the cursor unit explicitly references them or you need to verify a `blocked_by` claim.

After completing the cursor unit:

- Run the Unit-level review pipeline from the cursor unit's md (`## Review pipeline` section — typically the built-in `/code-review`, sometimes `/simplify` depending on the user's config). These run on the unit's local working-tree diff; treat findings as candidates to triage against plan context (a flagged "unused" symbol may be an intentional forward-reference a later unit wires up — see the unit body) rather than blindly applying them.
- Commit per the unit's commit guidance.
- Update `progress.md`: move the unit into Done with a one-liner, advance the cursor to the next unit id.

If the cursor unit is blocked (an external dependency, a question for the user, a review finding that needs discussion), record it under Blockers in `progress.md` and stop — do not jump to a different unit.

When the cursor unit was the **last** Unit in the plan:

- After its Unit-level review and commit, read `progress.md`'s `## Plan-level review` section and walk that pipeline against the cumulative (committed) plan diff. The recommended entry is `/planview:plan-review-prompt` — run it (it's agent-invocable); it reads the plan + diff and composes a ready-to-run `/codex:adversarial-review --base <branch>` command. Surface that command for the user to run, and wait. codex review itself sets `disable-model-invocation` (you **cannot** invoke it via SlashCommand) and needs `/codex:setup` + `codex login` first.
- Surface findings to the user.
- On approval, archive the plan dir to `done/plan/<YYMMDD-N-slug>/` per the top-level archiving convention. Don't archive before the user signs off — even if `## Plan-level review` is empty.

## Cross-references

- `notes/AGENTS.md` — top-level naming/archiving convention for `notes/` (plans, research, backlog, done).
- `docs/agent-guide.md` — what the `/planview` skill emits and the heuristics it follows when shaping a plan.
- `docs/data-model.md` — Plan and Unit schema, plus the per-unit Topology shape.
