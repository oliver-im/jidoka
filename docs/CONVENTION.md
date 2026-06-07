# The plan-lifecycle convention

A small, tool-agnostic convention for keeping a repository **honest about what each document is** — a settled decision, work in progress, or a half-formed idea. The lifecycle status of every document is encoded in **which directory it lives in**, so finished work is never mistaken for current truth.

It is three directories and two rules. You can adopt it in any repo by hand; the tooling at the end is optional.

## Why

Repositories accumulate prose: design notes, plans, research, proposals. Most of it is written once and never moved. A year later the repo holds a confidently-worded plan describing an architecture you have since replaced — and nothing about the file says it is stale. A teammate greps it and trusts it. An AI agent reads it as fact and acts on it. (That is the sharp version of the problem: an agent's working context is whatever it can read in the repo, so a stale doc it *can* read is worse than no doc — it is "confidently wrong.")

The usual fixes do not hold. A `status: deprecated` line in the front-matter is invisible to a grep for the topic. A wiki rots out of sync with the code. "We will remember it is old" does not survive turnover or a fresh agent session.

The convention's bet: **carve documents by lifecycle status, and make the directory the status.** To know whether a doc is current you look at *where it is*, not at what it says about itself. Moving a file is the act of changing its status.

## The three kinds

Three top-level peers (conventionally under `docs/`), each answering one question:

| Kind | The question it answers | Status | May drift from the code? |
|---|---|---|---|
| **`ideas/`** | "What if? Why? Should we?" | open | **Yes** — the folder is the disclaimer |
| **`exec-plans/`** | "What are we building, and how far along?" | scoped work | Frozen once completed |
| **`design-docs/`** | "Why is it built this way?" | settled truth | Maintained; reversed ones move aside |

### `ideas/` — open questions

Half-formed thinking: explorations, problem analysis, "should we even do this." Nothing here is a promise. A reader — human or agent — should treat a file in `ideas/` as **thinking-in-progress, not current truth**; it is explicitly allowed to drift from the code. An idea either graduates (see the funnel) or gets pruned.

### `exec-plans/{active,completed}/` — scoped work

A plan is a finishable piece of work, decomposed into reviewable units. Two sub-directories carry the status:

- `active/` — in flight.
- `completed/` — finished. **Frozen historical records**, provenance-stamped (rule 1). A completed plan describes *what was intended and done at the time* — it is never groomed to match the current code, because that would destroy its value as a record of how the code got here.

### `design-docs/{,superseded}/` — settled decisions

The durable "why" behind the system: the rationale a newcomer needs in order not to re-litigate a closed question. Unlike plans, these are **maintained as living truth**. When a decision is reversed, its doc moves to `superseded/` (kept as a record, not deleted) — so the top level of `design-docs/` is always exactly the current set of decisions.

## Status is the location

The one load-bearing rule, worth stating on its own:

> **Never rely on a file's contents to know its lifecycle state. The directory is the status.**

A plan in `completed/` is done. A decision in `superseded/` is reversed. An idea in `ideas/` may be nonsense. You learn this from the path, before reading a word — and a grep that surfaces a file surfaces its status along with it. Changing status means a `git mv`, not editing a header.

## The funnel

An idea flows into **either** a plan **or** a decision — which is why `ideas/` is a peer of both, not a sub-state of `exec-plans/`:

```
                 ┌──►  exec-plans/active/   "we are going to build this"
   ideas/  ──────┤
                 ├──►  design-docs/         "we have decided this; nothing to build"
                 │
                 └──►  (pruned)             "never mind"
```

When an idea graduates to a plan it **keeps its identity** — the file `260607-3-foo.md` becomes the directory `exec-plans/active/260607-3-foo/` (same id). A plan, when finished, moves `active/ → completed/`. A decision, when reversed, moves to `design-docs/superseded/`. Every transition is a move.

## The two rules

**1. Provenance stamp on archive.** When a plan moves to `completed/` (or a decision to `superseded/`), prepend one line recording how current the record is:

```
> STATUS: completed · <YYYY-MM> · realized-by <commit or range>
> STATUS: superseded · <YYYY-MM> · kept as record
```

Add a sentence of context if the code has since moved past the record — the record stays frozen; the stamp tells a reader how to weight it.

**2. Reference, don't paste.** In ideas and plans, point at code by `path:symbol` (e.g. `src/config.ts:defaultConfig`) instead of pasting snippets. These artifacts carry **durable intent**, which stays true; a pasted snippet captures a moment of code, which silently goes stale. Quote a line verbatim only when its exact wording *is* the thing being changed.

## Naming

- **Temporal kinds** (`ideas/`, `exec-plans/`) use `YYMMDD-N-slug`:
  - `YYMMDD` — the date the entry was started (local time, two-digit year).
  - `N` — a per-day counter **shared across `ideas/` and `exec-plans/`** (so an idea can keep its id when it becomes a plan). To pick the next `N`, scan the day's existing `^<today>-(\d+)-` entries across the live kinds (`ideas/` and `active/` plans) and take max + 1. Frozen records (`completed/`, superseded) aren't rescanned, so a long-archived id can recur — the date + slug still disambiguate.
  - `slug` — kebab-case, ≤ 60 chars, `^[a-z0-9-]+$`.
  - A plan is a **directory**; its units are files `NN-unit-slug.md` with a plan-local counter from `01`.
- **`design-docs/`** are **topic-named** (`cli-over-mcp.md`, not a date) — a decision is referenced by its subject, and its date lives inside the doc. Location (top level vs `superseded/`) carries the status.
- **Every directory carries a self-documenting `index.md`** stating its kind and drift rule. (No `.gitkeep` — the `index.md` is what keeps an otherwise-empty directory in git.)

## Adopt this in a new repo

The structure is just directories and this file:

```sh
mkdir -p docs/{ideas,exec-plans/{active,completed},design-docs/superseded}
# drop this file in (planview is its canonical home):
curl -sfo docs/CONVENTION.md https://raw.githubusercontent.com/oliverim/planview/main/docs/CONVENTION.md
# add a one-line index.md to each dir naming its kind + drift rule
```

Then drop open questions into `docs/ideas/`, scoped work into `docs/exec-plans/active/`, and settled rationale into `docs/design-docs/`. Archive by `git mv` with a provenance stamp. That is the whole convention — everything below is optional.

## Execution workflow (recommended, optional)

> This is the **opinionated execution layer** — how *work flows through git* while a plan is in `active/`. It is genuinely optional: keep the three-kind docs structure and ignore all of this if you like. It is written down because it is what makes `active/` mean "in flight" precisely.

The idea: **a plan is worked in its own git worktree, and each unit is a branch.**

- **Per plan** — a worktree `worktrees/<plan-id>/` on a branch `plan/<plan-id>`, off `main`. The plan's `active/<plan-id>/` directory physically lives *inside that worktree*. Consequence: `active/` is empty on `main`, and **`git worktree list` is the live index of in-flight plans**.
- **Per unit** — a branch `unit/NN-slug` off the plan branch. Do the unit's work there, review it, then **squash-merge** into the plan branch as one `Unit NN: <title>` commit. The squash absorbs the review→fix churn, so the plan branch carries exactly one clean commit per unit.
- **At the end** — `git mv active/<plan-id> completed/<plan-id>`, add the provenance stamp, commit, then merge the plan branch to `main` with `--no-ff` and remove the worktree. **`main` only ever gains plans under `completed/`** — never under `active/`.

The payoff: `main` stays clean of in-flight churn, completed work lands atomically as a frozen record, and the set of active plans is a `git` command rather than a directory you have to garden. By hand this is a `git worktree add` plus a few merges; a driver tool can render the steps into each plan and create the worktree for you (see below).

## Tooling (optional)

The convention is directories + two rules; it needs no tool. [planview](https://github.com/oliverim/planview) is the **reference driver** — a Claude Code plugin that materializes plan-mode output straight into `exec-plans/active/<id>/`, and can render the execution workflow into each plan's `progress.md` and create the worktree automatically (an opt-in `git_workflow` flag). It is one way to drive the lifecycle, not a requirement: any tool, script, or a bare `mkdir` and `git mv` works just as well.
