---
name: planview:plan-review-prompt
description: Compose a targeted adversarial-review focus prompt for a COMPLETED planview plan, then emit a ready-to-run /codex:adversarial-review command for the operator. Reads the plan dir (overview + units + progress, including any deferred forward-reference notes) and the cumulative committed diff, and aims a hostile review at the cross-unit risks that per-unit reviews structurally can't see. It does NOT perform the review itself — it prepares the sharpest possible prompt for a human to run. Use as the plan_review step, after the last unit lands and is committed.
allowed-tools: Read, Grep, Glob, Bash
---

# planview:plan-review-prompt

You **compose the focus prompt** for a hostile, plan-level adversarial review — you do **not** perform the review. Your deliverable is a ready-to-run `/codex:adversarial-review` command, aimed by what you know about how this plan was built.

## Why this step exists

Per-unit review (`/code-review`) is plan-blind: it sees one unit's diff at a time and structurally cannot judge cross-unit consistency, or whether a forward-reference one unit deferred actually got wired up by a later unit. Those problems live in the **cumulative diff**, viewed as one integrated change. The agent that just executed the plan holds the best context for aiming a hostile review at them.

But the codex review commands set `disable-model-invocation`, so you **cannot run the review yourself** — and you shouldn't try. Your job is to hand the operator the sharpest possible prompt; they pull the trigger.

## Scope and tools

- **Read-only inspection.** `Read`, `Grep`, `Glob`, and `Bash` for **read-only git only** (`git log`, `git diff`, `git merge-base`, `git symbolic-ref`, `git status`). No `Edit`, no `Write`, no commits, no running codex.
- **The plan dir** lives under the user's `plan_dir_root` (the convention's `docs/exec-plans/active/`, sometimes a plain `plan/`), named `YYMMDD-N-slug/`, containing `overview.md`, `progress.md`, and per-unit `0N-<slug>.md` files.
- **Target selection:**
  - If the user named a plan dir in their invocation, target it.
  - Otherwise pick the most recent: plan dirs are `YYMMDD`-prefixed, so the alphabetically last sub-dir under the plans root is newest. Use `Glob`, then sort.
  - If you can't find one, say so in one line and stop.
- **User focus.** If the user supplied focus text ("hammer the migration safety"), weight it heavily in the prompt you compose — but still add any other defensible target.

## Determine the base ref

The plan's units are committed, so the cumulative diff is `merge-base(<base>, HEAD)..HEAD`. Find `<base>`:

1. If `overview.md` names the branch the plan started from, use that.
2. Else detect the repo default: `git symbolic-ref --quiet refs/remotes/origin/HEAD` (strip to the branch name); fall back to the first of `main`, `master`, `trunk` that exists.
3. State the base you chose in your output and tell the user to swap `--base` if the plan branched elsewhere.

If `HEAD` equals the base or there are no commits since the merge-base, say there's nothing to review and stop.

## Method

1. Read `overview.md` (intent, claimed deliverable, unit list), then `progress.md` (the Done log, any Blockers/Notes), then each unit md in order. Pay special attention to **"expected incompleteness" / forward-reference notes** in unit bodies and any unit that flagged itself as needing an adversarial pass.
2. Survey the cumulative diff: `git diff --stat <base>...HEAD` first, then `git diff <base>...HEAD` (read the high-signal files; for very large diffs, lean on the stat + the files the plan flagged as risky).
3. Synthesize the **few highest-value scrutiny targets** — what a hostile reviewer should attack given how this plan was built:
   - **Cross-unit consistency** — integration seams between units; a contract one unit defined and another consumed.
   - **Deferred forward-references** — for each "unused until Unit NN" note, instruct the reviewer to confirm it is now correctly wired up (this is the loop the per-unit gates left open).
   - **Invariants / contracts spanning units** — data-model rules, validation, error handling that no single unit's diff fully exercised.
   - **Riskiest / most-coupled / largest changes** — by diff stat and by what the plan called foundational.
   - **Coverage gaps** — the plan claimed X; does the sum of the diff actually deliver X (tests, docs, wiring)?

## Output

Return:

1. **One or two sentences** naming what you're aiming the review at and why (grounded in the plan + diff).
2. **The ready-to-run command**, in a copy-paste block. Compose the focus as a single-line string (separate targets with `; ` so it pastes cleanly as one command) that: states this is the cumulative output of an N-unit plan and to review it as one integrated change, then lists your specific, grounded targets (name files / units / symbols):

   ```
   /codex:adversarial-review --base <base> "Cumulative diff of the N-unit '<slug>' plan; review as one integrated change. Targets: <target 1>; <target 2>; confirm forward-reference <symbol> added in Unit 0X is wired up by Unit 0Y; …"
   ```

3. **A fallback line:** if codex rejects with the 1MB error (large diffs) or you want its native reviewer, run `/codex:review --base <base>` (no focus text — the native reviewer doesn't accept it).
4. **An operator note:** this is operator-run — *you* (the user) run the command; it needs `/codex:setup` + `codex login` first. Present it and wait for the user; don't try to invoke it.

## Grounding and calibration

- Every target must be defensible from the diff + plan you actually read — name the specifics. Don't invent units, symbols, or risks.
- A **focused** prompt beats an exhaustive one: a few sharp targets the per-unit reviews couldn't catch, not a re-listing of the whole diff. If the plan was small and low-risk, say a plain `/codex:adversarial-review --base <base>` is enough and don't manufacture targets.
- Do **not** perform the review or summarize the diff as if you'd reviewed it. Your product is the prompt.
- The focus text is reviewer-agnostic — codex is just the default vehicle. If codex isn't set up, the same prompt can be pasted into any adversarial reviewer.
