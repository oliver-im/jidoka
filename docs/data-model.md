# Data Model

Shared reference for both [agents](agent-guide.md) and [developers](developer-guide.md). Defines the contract between the skill (which produces plan markdown) and the renderer (which validates it and materializes a plan dir).

## Plan

A **Plan** is the top-level output of `/jidoka`: a markdown document with a `# Title` H1 and a sequence of `## Unit NN: <title>` sections, materialized as a directory of markdown files (`overview.md`, `progress.md`, `0N-<unit-slug>.md`).

## Plan markdown shape

This is what the skill emits and what the hook / `jidoka materialize` parses. The renderer auto-derives the slug, the unit IDs, and the default `blocked_by` chain — you don't write those.

```
# <task summary — used as the plan slug source>

<optional preamble paragraph(s); ignored by the parser>

## Unit 01: <title>

<one or two sentences — the unit summary>

<rest of the body — Tasks, Acceptance, Notes, etc.>

## Unit 02: <title>

<summary>

<body — Tasks, Acceptance, Notes, etc.>
```

The parser tolerates a few heading variants (canonicalized internally):

| Variant | Example |
|---|---|
| `Unit` prefix, two-digit | `## Unit 01: Foo` |
| `Unit` prefix, single-digit | `## Unit 1: Foo` |
| `Step` prefix | `## Step 01: Foo` |
| Bare number, colon | `## 01: Foo` |
| Bare number, period | `## 01. Foo` |
| Bare number, hyphen | `## 01 - Foo` |
| Bare number, em-dash | `## 01 — Foo` |

If no `# Title` H1 is present, the first non-blank, non-heading line of leading prose is taken as the title (a fallback for hand-written drafts; the skill always emits an explicit H1).

## Plan Data Model (typed)

These are the types the renderer consumes after parsing — `parsePlanMarkdown` produces a `Plan` with these shapes filled in.

```typescript
interface Plan {
  task_summary: string;            // one-line description of the overall task
  slug: string;                    // kebab-case, ≤ 60 chars, ^[a-z0-9-]+$
  units: Unit[];                   // 1-N units, sequential by default
  // Materializer-attached at materialize time from `config.pre_review`;
  // never present on parsed input. `ReviewStep` defined under Review commands.
  pre_review?: ReviewStep[];
  // Materializer-attached at materialize time from `config.plan_review`;
  // never present on parsed input.
  plan_review?: ReviewStep[];
  // Materializer-attached at materialize time from `config.git_workflow`;
  // gates the `## Git workflow` block in progress.md. Never on parsed input.
  git_workflow?: boolean;
}

interface Unit {
  id: string;                      // ^[0-9]{2}-[a-z0-9-]+$ (e.g. "01-housekeeping")
  title: string;
  summary: string;
  blocked_by: string[];            // unit ids in the same plan
  agents_involved?: string[];      // free-form labels for the unit metadata
  body_markdown: string;           // the full unit body — Tasks, Acceptance, etc.
  // Materializer-attached at materialize time from `config.unit_review`;
  // never present on parsed input.
  review?: ReviewStep[];
}
```

### Plan JSON Schema (legacy)

`jidoka materialize` still accepts a JSON document of this shape (auto-detected when the input begins with `{`) for hand-written or scripted callers. The skill no longer emits this format — markdown is the primary interface.

```json
{
  "task_summary": "string",
  "slug": "string",
  "units": [
    {
      "id": "string",
      "title": "string",
      "summary": "string",
      "blocked_by": ["string"],
      "agents_involved": ["string (optional)"],
      "body_markdown": "string"
    }
  ]
}
```

Review pipelines aren't part of the wire format — the parser doesn't accept them and the skill doesn't produce them. They come from the user's config (`~/.claude/plugins/jidoka/config.json`) and are attached to the in-memory plan at materialize time. See [Review commands](#review-commands) below.

### Plan Field Semantics

| Field | Type | Description |
|---|---|---|
| `task_summary` | `string` | One-line description of the overall task. Becomes the H1 of `overview.md`. |
| `slug` | `string` | Kebab-case, 1–60 chars, no leading/trailing hyphen. Becomes the trailing segment of the dir name `<YYMMDD>-<N>-<slug>`. |
| `units` | `Unit[]` | At least one unit. Order in the array doubles as default visual order. |
| `id` | `string` | `^[0-9]{2}-[a-z0-9-]+$`. The two-digit prefix is the in-plan ordinal; the file name is exactly `<id>.md`. |
| `title` | `string` | Heading text ("Unit 01 — `{title}`" in the unit md). |
| `summary` | `string` | One or two sentences. Shown above the body markdown in the unit md. |
| `blocked_by` | `string[]` | Unit ids this unit depends on. Must reference siblings in the same plan; cycles and self-deps are rejected at validation time. |
| `agents_involved` | `string[]?` | Optional labels for the unit metadata block. Omit for "main only". |
| `body_markdown` | `string` | The full body of the unit, embedded verbatim into `<id>.md`. Typically `## Tasks`, `## Acceptance`, etc. |
| `review` | `ReviewStep[]?` | Materializer-attached. A copy of `unit_review` from the user's config — each entry is a slash command or a `{ run, mode }` template, rendered verbatim as a Unit-md checkbox (templates show their `run` + a `print`/`exec` mode badge). |

## Review commands

Review commands come from the user's config at `~/.claude/plugins/jidoka/config.json` (scaffolded by `jidoka:setup`; hand-edited afterward). The materializer copies them onto each Unit (rendered into the Unit md), onto the Plan as a pre-execution checklist (rendered into `progress.md` as `## Pre-execution review`), and onto the Plan as a post-execution checklist (rendered into `progress.md` as `## Plan-level review`).

### Config shape

```typescript
type ReviewStepMode = "print" | "exec";
type ReviewStep =
  | string                                   // a slash command, e.g. "/code-review"
  | { run: string; mode?: ReviewStepMode };  // a bash template; mode defaults "print"

interface Config {
  // ...other scalar keys...
  pre_review: ReviewStep[];    // runs after materialize, before Unit 01
  unit_review: ReviewStep[];   // runs after each Unit lands
  plan_review: ReviewStep[];   // runs after the last Unit's review
  review_reconverge: boolean;  // default true; gates the re-review-to-convergence note (below)
}
```

Each entry is a **review step** in one of two forms:

- a **slash command** string (must start with `/`) — built-in (`/code-review`, `/simplify`) or plugin-namespaced (`/codex:adversarial-review`), optionally with arguments (`/codex:adversarial-review --base main`).
- a **`{ run, mode }` bash template** — a tool-agnostic command so the pipeline isn't tied to slash commands or any one tool (`codex exec`, cursor-agent's `agent -p`, `gemini`, …). `run` may contain the placeholders `{plan_dir}`, `{base}`, `{diff_range}`, `{focus}` (see *Command semantics & invocation*); `mode` is `"print"` (default) or `"exec"`.

Object form (not a prefix-tagged string) because a bash template can legitimately start with `/` (absolute paths), so a prefix would be ambiguous; an object is unambiguous and extensible.

### Review stages

| Stage | Config key | Renders into | Default | When it runs |
|---|---|---|---|---|
| Pre-execution | `pre_review` | `progress.md` (`## Pre-execution review`, above Done) | `["/jidoka:pre-plan-review"]` | On the first session, before Unit 01 — the resuming agent works through it against the freshly materialized plan dir, then stops: it auto-runs the agent-invocable steps (the default `/jidoka:pre-plan-review`, or an `exec` template) and surfaces any `print` template / operator-run slash command for the human. Reviews the plan *as a plan* — no diff exists yet. |
| Per-unit | `unit_review` | Each `<id>.md` (`## Review pipeline`) | `[{ run: "claude -p '/code-review {diff_range}' < /dev/null", mode: "exec" }]` | After the unit's work is committed on its `unit/NN` branch, before the squash-merge. Local correctness gate on the unit's branch diff. The built-in `/code-review` is `disable-model-invocation`, so the default reaches it through `claude -p` (agent-run via Bash) instead of as a bare slash command — see *Command semantics & invocation*. |
| Plan-level | `plan_review` | `progress.md` (`## Plan-level review`, below Notes) | `[{ run: "codex exec -s read-only -c model_reasoning_summary=detailed \"{focus}\" < /dev/null", mode: "exec" }]` | After the last unit's review lands and is committed. Adversarial pass against the cumulative *committed* plan diff — the completeness net for cross-unit issues. (`-c model_reasoning_summary=detailed` asks codex for its fullest reasoning summary; the `< /dev/null` is the stdin hang-guard — see *Command semantics & invocation*.) |

### Re-review to convergence

When `review_reconverge` is `true` (the default), the rendered `unit_review` and `plan_review` sections carry a **re-review-to-convergence** instruction: after a review flags a finding **at or above the reviewer's own middle "should-fix" severity tier** (MEDIUM / Major / P1), re-run that same review once on the post-fix diff and re-triage. The rationale is that a review's fix commits are themselves *unreviewed* code — a productive review leaves a large unreviewed delta that would otherwise sail straight to the human seam. v0 is deliberately **one extra pass** gated on that single severity signal: the gate reads the reviewer's own label rather than a fresh "material?" judgment, and decides only *whether to re-run*, never which findings surface. `pre_review` is excluded (it is surface-don't-revise and reads the plan md, not a code-fix diff). `review_reconverge` is **global-config-only** (like the review arrays) and, like `git_workflow`, is copied onto the Plan at materialize time; the renderer emits fixed prose and runs nothing. Rationale + the deferred unbounded-loop form: `docs/discussions/review-pipeline.md` (§Re-review to convergence).

### Validation

The materializer denies the ExitPlanMode hook (or fails the `materialize` CLI) when an entry is neither a non-empty string starting with `/` nor a `{ run, mode }` template (`run` a non-empty string; `mode` one of `print`/`exec`, defaulting to `print`; no unknown keys). Otherwise every entry is rendered verbatim — the renderer never substitutes placeholders or runs anything.

Review steps are **global-config-only**: the per-repo `.jidoka.json` override allow-list excludes `pre_review`/`unit_review`/`plan_review` (and `review_reconverge`), so a cloned repo's committed config can never make a resuming agent run arbitrary shell. This is the security boundary that makes `exec` (below) safe.

### Command semantics & invocation

jidoka renders commands verbatim; it does not run them. These properties of the common review commands shape what belongs in each stage:

- **Namespace trap.** Built-in `/code-review` reviews a **local diff** — given a target, that target's range; given none, the branch's commits ahead of its upstream *plus* any uncommitted changes (correctness bugs + reuse/simplification/efficiency cleanups). Note the untargeted scope is **not** "the working tree": it includes committed-but-unpushed history, which is why an untargeted run mid-plan re-reviews every earlier unit. `/code-review:code-review` is a *different* tool — the code-review plugin, which reviews a **GitHub PR**. Per-unit and plan-level gates operate on local diffs, so they want the built-in `/code-review`, not the PR plugin.
- **No `--fix` on unit review.** Unit review runs mid-plan with no plan context, so it flags intentional forward-references (a function unit 01 adds but unit 03 wires up reads as "unused"). Findings are therefore *candidates* a plan-aware reviewer triages, not edits to auto-apply — `--fix` would "fix" a correct forward-reference by deleting it.
- **No focus argument.** `/code-review` (and `/codex:review`) take no free-text focus. Per-unit review focus belongs in the **unit body prose**, where the triager reads it. `/codex:adversarial-review` is the exception — it accepts free-form focus text, useful for aiming the plan-level pass at cross-unit consistency.
- **`/simplify` is cleanup-only.** It applies reuse/simplification/efficiency/altitude fixes and does **not** hunt bugs — a complement to `/code-review`, not a substitute.
- **Plan-level diff is committed.** By plan-end every unit is committed, so the cumulative diff lives between the base branch and HEAD. Pass a base ref explicitly — `/codex:adversarial-review --base <branch>` (reviews `merge-base..HEAD`) or `/code-review <branch>`. Don't rely on the untargeted default to "see nothing" and no-op: per the bullet above it still covers commits ahead of upstream, and per the fail-open bullet below an empty scope makes it review the most recent commit instead. Forgetting the base ref is a silent mis-scope, not a harmless one.
- **Two-mechanism invocation (operator-run vs agent-run spans all three stages).** Whether a resuming agent runs a step or hands it to the operator is decided two ways. For a **template**, the step's own `mode`: `print` (default) surfaces the ready-to-run command and stops for the operator; `exec` has the agent run it via the **Bash** tool and relay the findings. For a **slash command**, the target skill's `disable-model-invocation` — codex's review commands **and the built-in `/code-review`** set it, so they're operator-run (the agent can't invoke them via the SlashCommand tool). The `exec`/Bash route is legitimate precisely because `disable-model-invocation` blocks only `SlashCommand`, not Bash. **`print` is the *schema* default** — a template that omits `mode` is operator-run, so a hand-written step never starts auto-running by accident. It is not a statement about what jidoka ships: both shipped templates (`unit_review`, `plan_review`) set `exec` deliberately, because a step the resuming agent cannot run is a step that stalls the loop. The per-unit stop for human review is preserved by the resume protocol's stop-after-each-unit rule, not by making the review itself operator-run.
- **Placeholders are stage-scoped, substituted by the resume/agent layer (never the renderer).** A template `run` may reference `{plan_dir}` (the materialized plan dir), `{base}`, `{diff_range}` (`merge-base(<base>,HEAD)..HEAD`), and `{focus}` (a composed review focus). **`{base}` is the ref *this stage's* work forked from, not a fixed branch:** at `unit_review` it is the **plan branch** (what `unit/NN` forked from), making `{diff_range}` the single unit's diff; at `plan_review` it is the branch the *plan* forked from (`main`), making the same expression the cumulative plan diff. Resolving `{base}` to `main` at unit stage silently widens every unit's review to Units 01..NN — the exact scope the unit gate exists to avoid. **Without the git workflow there is no plan branch:** `git_workflow` ships `false`, and the worktree-per-plan / branch-per-unit topology is what gives `{base}` its unit-stage referent. With it off, resolve `{base}` to the commit the unit's own work started from — not `main`, which reproduces the widening just described. The renderer records placeholders verbatim — there's no diff at materialize time. The resuming agent substitutes them before running, always as a **resolved SHA** (`<merge-base>..HEAD`), never an unexpanded `$(git merge-base …)`, which the shipped templates' single-quoted prompts would pass through as literal text. Prefer the SHA over a branch name: the value lands inside single quotes in a shell command with no escaping, and git permits `'`, `$(…)`, `;` and `|` in ref names (`feature/o'brien` is legal and closes the quote early). The `/jidoka:plan-review-prompt` composer fills `{focus}` (and the rest) for plan-level review. `pre_review` runs before any unit, so only `{plan_dir}` is meaningful there.
- **The built-in `/code-review` is operator-run too — the default reaches it via `claude -p`.** `/code-review` sets `disable-model-invocation` — stated outright on Anthropic's Code Review docs page, so it is documented and deliberate, not a regression (the 2.1.169 → 2.1.220 version boundary was reported by binary inspection and is *not* re-verified here; what was verified directly is the `claude -p` workaround) — so as a bare slash-command step a resuming agent cannot invoke it by any in-session route and every unit stops for the operator. The shipped `unit_review` therefore wraps it in a template — `claude -p '/code-review {diff_range}' < /dev/null`, `mode: "exec"` — which puts the command in the **user-prompt slot at the CLI layer**, outside the flag's reach (the same Bash-not-SlashCommand boundary the codex template relies on). Set it back to a bare `"/code-review"` if you deliberately want a human gate at every unit — but that is not a pure revert: the bare command carries no range, so on a unit branch with no upstream it falls back to `main...HEAD`, the whole plan so far. Three costs to weigh on the template form: the nested session is **cold** (it reads `CLAUDE.md` but not the unit's acceptance criteria — `/code-review` takes no focus argument, so per-unit focus still belongs in the unit body prose); it runs for minutes, so the `exec` step needs the Bash timeout raised past its 120 s default (or to be backgrounded), which applies equally to the shipped `codex exec` plan-review step; and it inherits the invoking user's permission mode while running with cwd inside the repo, so it reads that repo's `CLAUDE.md`. Review steps being global-config-only stops a cloned repo from *specifying* shell, but it does not stop a cloned repo's `CLAUDE.md` from steering the nested reviewer — treat an untrusted repo accordingly.
- **`/code-review` does not fail closed on an empty diff.** Given nothing to review — no commits in range, clean tree — it does *not* report "nothing to review". It falls back to reviewing the most recent commit and returns confident, well-cited findings about unrelated code. A gate can therefore **pass having reviewed the wrong diff**, indistinguishably from a clean review. That is why `{diff_range}` is mandatory in the default (an unranged run additionally re-reviews every earlier unit, since its default scope is "commits ahead of upstream plus uncommitted changes") and why the resume protocol checks the range is non-empty before running the step. Passing an explicit range also excludes uncommitted work, so the unit must be committed on its branch first.
- **codex commands are operator-run.** `/codex:review` and `/codex:adversarial-review` set `disable-model-invocation: true`, so a resuming agent cannot invoke them via the SlashCommand tool — they're surfaced for the human to run. They require `/codex:setup` + `codex login` (they fail loudly otherwise). If jidoka drives plan-level review, leave codex's own Stop-time `--enable-review-gate` off to avoid double-gating. (Running codex as a `{ run: "… codex exec …", mode }` **template** is the agent-run alternative — Bash, not SlashCommand — when you want the agent to drive it.)
- **`/jidoka:plan-review-prompt` drives the configured `plan_review` vehicle (tool-agnostic).** The resuming agent runs this bundled composer (it is agent-invocable); it reads the plan + cumulative diff, composes a cross-unit focus (seams, deferred forward-references that should now be wired up), and drives whatever `plan_review` configures: a `{ run, mode }` template for a generic tool — into which jidoka injects its **own** plan-level review prompt, then `print` (surface the command) or `exec` (run via Bash) — or a slash command like `/codex:adversarial-review`, into which it composes the focus for the operator. codex is one vehicle, not hardcoded; the agent does the aiming, the configured mode decides who runs it. **How the diff reaches the reviewer is read off the template's `run`:** a no-pipe skeleton (e.g. `codex exec -s read-only "{focus}"`) is *agentic* — the tool runs `git diff` itself from the range the composer puts in `{focus}`, paging it at its own pace so an extremely large diff never has to fit in one context window; a `git diff {diff_range} | …` skeleton *feeds* the diff in (the only option for a tool that can't run shell, but the whole diff then lands in the model's context, so it doesn't scale to very large plans).
- **`codex exec` arg form blocks on an open stdin pipe — close it with `< /dev/null` (the unattended-hang guard).** Per `codex exec --help`: "If stdin is piped and a prompt is also provided, stdin is appended as a `<stdin>` block." So when the prompt is passed as an **argument** and the command runs unattended — the Bash tool, a backgrounded / non-TTY shell, where stdin is an open pipe that never sends EOF — `codex exec` blocks forever (printing only `Reading additional input from stdin...`). It does *not* reproduce under an interactive TTY (no piped stdin → it just uses the arg), which is why it slips past foreground testing. The shipped default `plan_review` therefore ends in `< /dev/null`, and the `/jidoka:plan-review-prompt` composer appends it whenever it delivers `{focus}` as an argument. This is an **empty-stdin guard, not a diff feed** — it leaves the agentic-vs-feed delivery decision above untouched (the reviewer still fetches the diff itself). It does **not** apply to the `codex exec -` stdin-prompt form or a `git diff … | codex exec` feed, where the prompt/diff *is* stdin and gets a clean EOF.
- **A bare "no issues" is uninspectable — so the *why cleared* is part of the output contract, and the transcript is the audit trail.** jidoka's plan-level reviewer prompt (`plan-review.prompt.md`) requires, alongside `### Findings`, a `### Focus dispositions` section: one line per focus target — clean / flagged (citing the finding's heading) / unconfirmed — with an evidence citation, held to the same grounding bar as a finding. That is the delivery channel for the review's negative space (why what wasn't flagged is fine); it lands in the reviewer's final message, the one part of the run that is always read, and it is tool-agnostic (any vehicle honoring the prompt produces it). Ground-truth verification of what the reviewer *actually* inspected uses the saved transcript's exec blocks — the commands it ran and their raw output — which exist regardless of any reasoning setting. The default template additionally passes `-c model_reasoning_summary=detailed` (current codex models default summaries **off** — `none`, visible in the run header's `reasoning summaries:` line): this adds codex's interleaved reasoning narration to the transcript for **on-demand** inspection ("what was it examining here"). It is a model-generated **summary**, not raw chain-of-thought (that stays hidden) — supporting context, not the rationale channel and not ground truth. `/jidoka:plan-review-prompt` relays findings + dispositions, names the transcript file, and checks the header actually reports the requested summary level, flagging a silent downgrade (see that skill, step 6). The flag applies to any reasoning-capable model codex runs; a non-reasoning model just ignores it. Cost: a few more reasoning-summary output tokens per review — negligible at plan-close cadence.

### Examples

Two worked `config.json` shapes (the `pre_review`/`unit_review`/`plan_review` slice; the file is parsed as JSONC, so `//` comments are allowed).

**Example A — slash commands throughout.** The pre-execution default, `/code-review` + a `/simplify` cleanup pass after each unit, and codex's adversarial review at plan-close. Both `/code-review` and codex are operator-run (`disable-model-invocation`), so this shape **deliberately gates every unit on a human** — the agent surfaces each command and stops rather than running it, and the `/jidoka:plan-review-prompt` composer aims codex and hands you the ready-to-run command. Choose it when you want the checkpoints; use the shipped default (Example B) when you want the loop to flow:

```jsonc
{
  "pre_review": ["/jidoka:pre-plan-review"],
  "unit_review": ["/code-review", "/simplify"],
  "plan_review": ["/codex:adversarial-review"]
}
```

**Example B — the shipped default: every stage agent-run.** Unit review reaches the built-in `/code-review` through `claude -p` (a bare slash command would be operator-run), with `{diff_range}` pinning the scope to the unit's branch diff; plan-level review runs via a tool-agnostic `codex exec` template in `exec` mode. `codex exec` is agentic, so it fetches the diff itself (paging it at its own pace — this is what scales to a large plan); the composer fills `{focus}` with jidoka's own plan-level review prompt + the cross-unit targets + the diff range, runs it via Bash, and relays the findings — no operator step. `-c model_reasoning_summary=detailed` adds codex's reasoning narration (a summary, not raw chain-of-thought) to the saved transcript for on-demand inspection — the *why flagged/cleared* itself arrives in the reviewer's required output (findings + per-target dispositions; see above). The trailing `< /dev/null` is the stdin hang-guard (see *Command semantics & invocation*) — without it an unattended `exec` run blocks forever on its open stdin pipe:

```jsonc
{
  "pre_review": ["/jidoka:pre-plan-review"],
  "unit_review": [
    { "run": "claude -p '/code-review {diff_range}' < /dev/null", "mode": "exec" }
  ],
  "plan_review": [
    {
      "run": "codex exec -s read-only -c model_reasoning_summary=detailed \"{focus}\" < /dev/null",
      "mode": "exec"
    }
  ]
}
```

See *Command semantics & invocation* above for the namespace trap (`/code-review` vs the `/code-review:code-review` PR plugin), print-vs-exec, and codex being operator-run.

### Terminology

| Term | Meaning |
|---|---|
| Plan | The top-level shape: a list of units with sequential ids and dependencies. Materialized to `<plan_dir_root>/<YYMMDD-N-slug>/` (default `docs/exec-plans/active/`). |
| Unit | One step in a plan. Reviewable on its own. Materialized to `<id>.md`. |
| Review step | An entry in `pre_review`, `unit_review`, or `plan_review`: a Claude Code slash command **or** a `{ run, mode }` bash template. Rendered verbatim as a checkbox in the materialized plan (templates carry a `print`/`exec` mode badge). |
| Pre-execution review | The `progress.md` section rendered from `pre_review`, between the cursor line and Done. On the first session the resuming agent auto-runs the agent-invocable steps and surfaces any `print`/operator-run step, then stops before Unit 01; reviews the plan as a plan. |
| Plan-level review | The `progress.md` section rendered from `plan_review`. Surfaces after every Unit is reviewed and committed; the resume protocol stops here and asks the user before archiving. |
