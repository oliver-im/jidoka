---
name: planview:plan-review-prompt
description: Compose a hostile, plan-level adversarial review for a COMPLETED planview plan and drive it through the configured plan_review vehicle. Reads the plan dir (overview + units + progress, incl. deferred forward-reference notes) and the cumulative committed diff, composes a cross-unit focus (integration seams, forward-references that should now be wired up), then honors the configured plan_review step shape — a { run, mode } bash template for a generic tool (codex exec, cursor-agent, …), into which planview injects its OWN review prompt; or a slash command, into which it composes the focus. print (default) surfaces a ready-to-run command and stops for the operator; exec runs it via Bash and surfaces findings. Tool-agnostic — no hardcoded reviewer. Use as the plan_review step, after the last unit lands and is committed.
allowed-tools: Read, Grep, Glob, Bash
---

# planview:plan-review-prompt

You compose the focus for a hostile, plan-level adversarial review **and** drive it through whatever review vehicle the user configured. You are not yourself the reviewer — you aim a *different* model (codex, cursor-agent, …) at the cumulative diff, using the context only the agent that just executed the plan has.

## Why this step exists

Per-unit review (`/code-review`) is plan-blind: it sees one unit's diff at a time and structurally cannot judge cross-unit consistency, or whether a forward-reference one unit deferred actually got wired up by a later unit. Those problems live in the **cumulative diff**, viewed as one integrated change. The agent that just executed the plan holds the best context for aiming a hostile review at them — so the high-value work is *composing the focus*, not running the review.

The review vehicle is **configurable and tool-agnostic**: codex is one option, not a hardcoded dependency. With a generic `codex exec` (or `cursor-agent`, `gemini`, …) template, **the tool supplies the model and planview supplies the prompt** — its own plan-level review prompt, co-located with this skill, never vendored from codex.

## Scope and tools

- **Read-only inspection + (in `exec` mode only) running the configured review.** `Read`, `Grep`, `Glob`, and `Bash`. Use Bash for **read-only git** (`git log`, `git diff`, `git merge-base`, `git symbolic-ref`, `git status`) at all times; and, **only when the configured step is `mode: "exec"`**, to run the composed review command. No `Edit`, no `Write`, no commits.
- **Why running it via Bash is legitimate.** Some review slash commands (codex's) set `disable-model-invocation`, which blocks only the **SlashCommand** route — not the **Bash** tool. So `exec` mode runs a *bash* command (e.g. `codex exec …`), which was never the thing the flag guards. `print` mode (the default) doesn't run anything — it hands the operator a ready-to-run command, preserving the human checkpoint at this last gate.
- **The plan dir** lives under the user's `plan_dir_root` (the convention's `docs/exec-plans/active/`, sometimes a plain `plan/`), named `YYMMDD-N-slug/`, containing `overview.md`, `progress.md`, and per-unit `0N-<slug>.md` files.
- **User focus.** If the user supplied focus text ("hammer the migration safety"), weight it heavily in what you compose — but still add any other defensible target.

## Read the configured plan_review vehicle

Read `~/.claude/plugins/planview/config.json` — it is **JSONC** (strip both `//` line and `/* */` block comments before parsing, matching the renderer's loader). If it is missing or unreadable, treat `plan_review` as the shipped default `[]`. Take the `plan_review` array. Each entry is a `ReviewStep` in one of two forms:

- a **`{ run, mode }` template** — a tool-agnostic bash command (e.g. `{ "run": "git diff {diff_range} | codex exec \"{focus}\"", "mode": "print" }`). `run` may contain the placeholders `{plan_dir}`, `{base}`, `{diff_range}`, `{focus}`; `mode` is `"print"` (default) or `"exec"`.
- a **slash command string** (e.g. `"/codex:adversarial-review"`).

**First drop any entry equal to this composer itself** (`/planview:plan-review-prompt`) — a legacy/self-referential config that would recurse. Then drive **each remaining step** (usually one), branching on its form (see **Drive the vehicle**). If nothing remains — the array was empty, or held only the composer — there is **no concrete vehicle**: fall back (case C).

## Target selection

- If the user named a plan dir in their invocation, target it.
- Otherwise pick the most recent: plan dirs are `YYMMDD`-prefixed, so the alphabetically last sub-dir under the plans root is newest. Use `Glob`, then sort.
- If you can't find one, say so in one line and stop.

## Determine the base ref

The plan's units are committed, so the cumulative diff is `merge-base(<base>, HEAD)..HEAD` — this is `{diff_range}`. Find `<base>` (this is `{base}`):

1. If `overview.md` names the branch the plan started from, use that.
2. Else detect the repo default: `git symbolic-ref --quiet refs/remotes/origin/HEAD` (strip to the branch name); fall back to the first of `main`, `master`, `trunk` that exists.
3. State the base you chose in your output and tell the user to swap it if the plan branched elsewhere.

If `HEAD` equals the base or there are no commits since the merge-base, say there's nothing to review and stop.

## Method — compose the focus

1. Read `overview.md` (intent, claimed deliverable, unit list), then `progress.md` (the Done log, any Blockers/Notes), then each unit md in order. Pay special attention to **"expected incompleteness" / forward-reference notes** in unit bodies and any unit that flagged itself as needing an adversarial pass.
2. Survey the cumulative diff: `git diff --stat {diff_range}` first, then `git diff {diff_range}` (read the high-signal files; for very large diffs, lean on the stat + the files the plan flagged as risky).
3. Synthesize the **few highest-value scrutiny targets** — what a hostile reviewer should attack given how this plan was built:
   - **Cross-unit consistency** — integration seams between units; a contract one unit defined and another consumed.
   - **Deferred forward-references** — for each "unused until Unit NN" note, instruct the reviewer to confirm it is now correctly wired up (the loop the per-unit gates left open).
   - **Invariants / contracts spanning units** — data-model rules, validation, error handling that no single unit's diff fully exercised.
   - **Riskiest / most-coupled / largest changes** — by diff stat and by what the plan called foundational.
   - **Coverage gaps** — the plan claimed X; does the sum of the diff actually deliver X (tests, docs, wiring)?

Call the result your **focus targets**: a short, grounded list naming specific files / units / symbols (separate targets with `; ` so it pastes cleanly as one line). A *focused* aim beats an exhaustive one — a few sharp targets the per-unit reviews couldn't catch, not a re-listing of the whole diff.

## Drive the vehicle

Branch on the configured step's form. Resolve `{plan_dir}` (the target plan dir), `{base}`, and `{diff_range}` as above. What `{focus}` expands to depends on the vehicle:

### A. `{ run, mode }` template — a generic tool

The tool brings the *model*; planview brings the *prompt*. So `{focus}` here is the **full reviewer instruction** = planview's own plan-level review prompt **plus** your focus targets:

1. **Read** planview's own plan-level reviewer prompt — a hostile, tooless prompt — at `$CLAUDE_PLUGIN_ROOT/skills/plan-review-prompt/plan-review.prompt.md` (the harness also names this skill's base directory in your invocation context). If `$CLAUDE_PLUGIN_ROOT` is unset, resolve it with Bash `echo "$CLAUDE_PLUGIN_ROOT"`, or `Glob` for `**/skills/plan-review-prompt/plan-review.prompt.md` and take the match.
2. Build `{focus}` = that prompt's text, then a `## Focus for this plan` section containing your composed targets (name the units/symbols; for each deferred forward-reference, instruct the reviewer to confirm it is wired up).
3. **Substitute the placeholders into `run`, then run/print it.** Substitute the single-line placeholders — `{plan_dir}`, `{base}`, `{diff_range}` — inline. Treat `{focus}` differently: it is **multi-line prose** (the prompt + your targets), so do **not** drop it inside a double-quoted shell argument, where its quotes / `$` / backticks would corrupt or mis-expand the command. Deliver it via a quoted heredoc or a temp file, and pass the diff to the tool on **stdin** (`git diff {diff_range} | <tool> …`) so a large diff never hits the argv limit. Construct the final command to fit the configured tool's actual CLI; state the base you assumed.
4. Then honor `mode`:
   - **`print`** (default): present the fully-substituted command in a copy-paste block and **stop** for the operator to run. Do not run it. This is the deliberate checkpoint.
   - **`exec`**: run the substituted command via the **Bash** tool, capture its output, and surface the reviewer's findings (don't editorialize — relay them, noting the base/range you used). If the tool needs auth/setup (e.g. `codex login`) and isn't ready, say so and fall back to presenting the command for the operator.

### B. Slash command (e.g. `/codex:adversarial-review`)

The slash command carries its own reviewer prompt, so do **not** inject planview's — here `{focus}` is just your **focus targets** (one line). Present the ready-to-run command for the operator (these commands are typically `disable-model-invocation`, so they're operator-run — you compose, they pull the trigger):

```
<configured-command> --base <base> "Cumulative diff of the N-unit '<slug>' plan; review as one integrated change. Targets: <target 1>; <target 2>; confirm forward-reference <symbol> added in Unit 0X is wired up by Unit 0Y; …"
```

State the base; tell the user to swap `--base` if the plan branched elsewhere. (`/codex:adversarial-review` needs `/codex:setup` + `codex login` first.) `--base <base>` is the **codex** convention — if the configured slash command doesn't accept it, fold the diff range into the focus text instead (e.g. "review the diff `<base>..HEAD`") rather than passing an unsupported flag.

### C. No concrete vehicle (empty, or only this composer)

There's nothing tool-specific configured. Preserve the out-of-box behavior: compose as in **B** with `/codex:adversarial-review` as the default suggested command, and add one line telling the user they can set a `{ run, mode }` template in `plan_review` (e.g. `{ "run": "git diff {diff_range} | codex exec \"{focus}\"", "mode": "print" }`) to use any tool — or `"mode": "exec"` to have the agent run it directly.

## Fallbacks

- **Large-diff / 1 MB limits** (codex): if the tool rejects an oversized prompt, fall back to its native reviewer (`/codex:review --base <base>`, no focus text — the native reviewer doesn't accept it), or narrow `{diff_range}` to the riskiest paths.
- The composed focus is **reviewer-agnostic** — the same targets can be pasted into any adversarial reviewer if the configured tool isn't available.

## Grounding and calibration

- Every target must be defensible from the diff + plan you actually read — name the specifics. Don't invent units, symbols, or risks.
- A **focused** prompt beats an exhaustive one. If the plan was small and low-risk, say a plain review with no special targets is enough and don't manufacture targets.
- In `print` mode, do **not** perform the review or summarize the diff as if you'd reviewed it — your product is the command. In `exec` mode, relay the reviewer's findings faithfully; the *reviewer's* judgment is the product, not yours.
