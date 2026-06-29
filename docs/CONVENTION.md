# The plan-lifecycle convention

A small, tool-agnostic convention for keeping a repository **honest about its in-flight work** — what's queued, what's being built, and what's finished — by encoding each piece of work's lifecycle status in **which directory it lives in**. Finished work is never mistaken for current truth, because a frozen record sits in a different folder from active work.

It is one directory with three states and two rules. You can adopt it in any repo by hand; the tooling at the end is optional.

**Scope.** This convention governs exactly one thing: the **lifecycle of scoped, finishable work** — the funnel from "maybe" to "done." It deliberately says nothing about where a repo keeps its *settled reference* — specs, architecture decisions, glossaries, the durable "why is it built this way." That belongs in a `wiki/` (or `discussions/`, `design/`, or whatever the repo calls it), maintained as current truth, and is each repo's own business. One convention, one job.

## Why

Repositories accumulate plans and notes about work. Most of it is written once and never moved. A year later the repo holds a confidently-worded plan describing an architecture you have since replaced — and nothing about the file says it is stale. A teammate greps it and trusts it. An AI agent reads it as fact and acts on it. (That is the sharp version of the problem: an agent's working context is whatever it can read in the repo, so a stale doc it *can* read is worse than no doc — it is "confidently wrong.")

The usual fixes do not hold. A `status: done` line in the front-matter is invisible to a grep for the topic. "We will remember it is old" does not survive turnover or a fresh agent session.

The convention's bet: **carve work by lifecycle status, and make the directory the status.** To know whether a plan is current you look at *where it is*, not at what it says about itself. Moving a file is the act of changing its status.

## The lifecycle: three states of one thing

A plan is a finishable piece of work, decomposed into reviewable units. It lives under `exec-plans/` and moves through three states — **the state is the directory**:

| State | Directory | The question it answers | May drift from the code? |
|---|---|---|---|
| **backlog** | `exec-plans/backlog/` | "Might we do this? What if? Should we?" | **Yes** — candidate, not started |
| **active** | `exec-plans/active/` | "We're building this — how far along?" | In flight |
| **completed** | `exec-plans/completed/` | "This is done." | **Frozen** record |

### `backlog/` — candidate work

The front of the funnel: a half-formed idea, a research spike, a scoped-but-not-started intention — anything from one line to a full proposal. Nothing here is a promise; a reader, human or agent, treats a backlog entry as **thinking-in-progress, not current truth**, and it is explicitly allowed to drift. A backlog item either graduates to `active/` (when it acquires units and someone starts building) or gets pruned. Maturity varies and is readable from the entry itself — the directory only tells you it isn't started.

### `active/` — in flight

A plan being worked: decomposed into units, edited as progress is made. Under the optional execution workflow (below) it lives in its own git worktree.

### `completed/` — finished

**Frozen historical records**, provenance-stamped (rule 1). A completed plan describes *what was intended and done at the time* — it is never groomed to match the current code, because that would destroy its value as a record of how the code got here. This is the repo's **only** home for frozen history, and it holds two kinds: finished plans, and **reversed decisions** archived out of the repo's reference area — its `wiki/` or `discussions/` (stamped `superseded` — see rule 1). So a decision overturned there doesn't linger as stale current-truth; it moves here as a record, and the reference area stays purely current.

## Status is the location

The one load-bearing rule, worth stating on its own:

> **Never rely on a file's contents to know its lifecycle state. The directory is the status.**

A plan in `completed/` is done. An item in `backlog/` may be nonsense. You learn this from the path, before reading a word — and a grep that surfaces a file surfaces its status along with it. Changing status means a `git mv`, not editing a header.

## The funnel

```
   backlog/  ──►  active/  ──►  completed/      "maybe → building → done"
      │
      └──►  (pruned)        "never mind"
```

A backlog item **keeps its identity** when it graduates — the file `260607-3-foo.md` becomes the directory `exec-plans/active/260607-3-foo/` (same id). A plan, when finished, moves `active/ → completed/`. Every transition is a move.

(An item whose answer turns out to be "decided, nothing to build" doesn't go to `completed/` — there's no work to record. Its conclusion lands in the repo's reference docs (`wiki/`, `discussions/`, …) as settled reference, and the backlog item is pruned. That hand-off is outside this convention's scope.)

## The two rules

**1. Provenance stamp on archive.** When a plan moves to `completed/` — or a reversed decision is archived there from the repo's reference docs — prepend one line recording how current the record is:

```
> STATUS: completed  · <YYYY-MM> · realized-by <commit or range>
> STATUS: superseded · <YYYY-MM> · replaced-by <what>, kept as record
```

Add a sentence of context if the code has since moved past the record — the record stays frozen; the stamp tells a reader how to weight it.

**2. Reference, don't paste.** In backlog items and plans, point at code by `path:symbol` (e.g. `src/config.ts:defaultConfig`) instead of pasting snippets. These artifacts carry **durable intent**, which stays true; a pasted snippet captures a moment of code, which silently goes stale. Quote a line verbatim only when its exact wording *is* the thing being changed.

## Naming

- Entries use `YYMMDD-N-slug`:
  - `YYMMDD` — the date the entry was started (local time, two-digit year).
  - `N` — a per-day counter **shared across `backlog/` and `active/`** (so an item can keep its id when it becomes a plan). To pick the next `N`, scan the day's existing `^<today>-(\d+)-` entries across the live states (`backlog/` and `active/` plans) and take max + 1. Frozen `completed/` isn't rescanned, so a long-archived id can recur — the date + slug still disambiguate.
  - `slug` — kebab-case, ≤ 60 chars, `^[a-z0-9-]+$`.
  - A backlog item may be a single file; a plan is a **directory**, its units files `NN-unit-slug.md` with a plan-local counter from `01`.
- **`index.md` is a re-derivable *catalog*, not hand-authored meta.** Each state directory's `index.md` lists its entries one line each — the entry's H1 summary — regenerated by grep, so it never drifts (the kind/drift rules live here in `CONVENTION.md`, not restated per directory). `backlog/` and `completed/` catalog their on-`main` entries; `active/`'s `index.md` just points at `git worktree list`, since in-flight plans live in worktrees. No `.gitkeep` — `index.md` keeps an otherwise-empty directory in git.

## Adopt this in a new repo

The structure is just directories and this file:

```sh
mkdir -p docs/exec-plans/{backlog,active,completed}
# Drop this file in (jidoka is its canonical home). Two ways:
#   - with the jidoka plugin, read it live or pin a refreshable snapshot
#     (re-run to update, never a hand-edited fork):  jidoka convention > docs/CONVENTION.md
#   - without the plugin, fetch the raw file:
curl -sfo docs/CONVENTION.md https://raw.githubusercontent.com/oliver-im/jidoka/main/docs/CONVENTION.md
# add an index.md to each dir — a re-derivable catalog of its entries (see Naming)
```

Then drop candidate work into `docs/exec-plans/backlog/`, scoped work into `docs/exec-plans/active/`, and archive by `git mv` to `completed/` with a provenance stamp. That is the whole convention — everything below is optional.

## Execution workflow (recommended, optional)

> This is the **opinionated execution layer** — how *work flows through git* while a plan is in `active/`. It is genuinely optional: keep the backlog/active/completed structure and ignore all of this if you like. It is written down because it is what makes `active/` mean "in flight" precisely.

The idea: **a plan is worked in its own git worktree, and each unit is a branch.**

- **Per plan** — a worktree `worktrees/<plan-id>/` on a branch `plan/<plan-id>`, off `main`. The plan's `active/<plan-id>/` directory physically lives *inside that worktree*. Consequence: `active/` is empty on `main`, and **`git worktree list` is the live index of in-flight plans**.
- **Per unit** — a branch `unit/NN-slug` off the plan branch. Do the unit's work there, review it, then **squash-merge** into the plan branch as one `Unit NN: <title>` commit. The squash absorbs the review→fix churn, so the plan branch carries exactly one clean commit per unit.
- **At the end** — `git mv active/<plan-id> completed/<plan-id>`, add the provenance stamp, commit, then merge the plan branch to `main` with `--no-ff` and remove the worktree. **`main` only ever gains plans under `completed/`** — never under `active/`.

The payoff: `main` stays clean of in-flight churn, completed work lands atomically as a frozen record, and the set of active plans is a `git` command rather than a directory you have to garden. By hand this is a `git worktree add` plus a few merges; a driver tool can render the steps into each plan and create the worktree for you (see below).

## Tooling (optional)

The convention is directories + two rules; it needs no tool. [jidoka](https://github.com/oliver-im/jidoka) is the **reference driver** — a Claude Code plugin that materializes plan-mode output straight into `exec-plans/active/<id>/`, and can render the execution workflow into each plan's `progress.md` and create the worktree automatically (an opt-in `git_workflow` flag). It is one way to drive the lifecycle, not a requirement: any tool, script, or a bare `mkdir` and `git mv` works just as well.
