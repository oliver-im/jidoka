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
| Per-unit | `unit_review` | Each `<id>.md` (`## Review pipeline`) | `["/code-review"]` | After the unit's diff lands and before it's committed. Local correctness gate on the unit's working-tree diff. |
| Plan-level | `plan_review` | `progress.md` (`## Plan-level review`, below Notes) | `[{ run: "codex exec -s read-only \"{focus}\" < /dev/null", mode: "exec" }]` | After the last unit's review lands and is committed. Adversarial pass against the cumulative *committed* plan diff — the completeness net for cross-unit issues. (The `< /dev/null` is the stdin hang-guard — see *Command semantics & invocation*.) |

### Validation

The materializer denies the ExitPlanMode hook (or fails the `materialize` CLI) when an entry is neither a non-empty string starting with `/` nor a `{ run, mode }` template (`run` a non-empty string; `mode` one of `print`/`exec`, defaulting to `print`; no unknown keys). Otherwise every entry is rendered verbatim — the renderer never substitutes placeholders or runs anything.

Review steps are **global-config-only**: the per-repo `.jidoka.json` override allow-list excludes `pre_review`/`unit_review`/`plan_review`, so a cloned repo's committed config can never make a resuming agent run arbitrary shell. This is the security boundary that makes `exec` (below) safe.

### Command semantics & invocation

jidoka renders commands verbatim; it does not run them. These properties of the common review commands shape what belongs in each stage:

- **Namespace trap.** Built-in `/code-review` reviews a **local working-tree diff** (correctness bugs + reuse/simplification/efficiency cleanups). `/code-review:code-review` is a *different* tool — the code-review plugin, which reviews a **GitHub PR**. Per-unit and plan-level gates operate on local diffs, so they want the built-in `/code-review`, not the PR plugin.
- **No `--fix` on unit review.** Unit review runs mid-plan with no plan context, so it flags intentional forward-references (a function unit 01 adds but unit 03 wires up reads as "unused"). Findings are therefore *candidates* a plan-aware reviewer triages, not edits to auto-apply — `--fix` would "fix" a correct forward-reference by deleting it.
- **No focus argument.** `/code-review` (and `/codex:review`) take no free-text focus. Per-unit review focus belongs in the **unit body prose**, where the triager reads it. `/codex:adversarial-review` is the exception — it accepts free-form focus text, useful for aiming the plan-level pass at cross-unit consistency.
- **`/simplify` is cleanup-only.** It applies reuse/simplification/efficiency/altitude fixes and does **not** hunt bugs — a complement to `/code-review`, not a substitute.
- **Plan-level diff is committed.** By plan-end every unit is committed, so the cumulative diff lives between the base branch and HEAD. A bare working-tree review sees nothing; pass a base ref: `/codex:adversarial-review --base <branch>` (reviews `merge-base..HEAD`) or `/code-review <branch>`.
- **Two-mechanism invocation (operator-run vs agent-run spans all three stages).** Whether a resuming agent runs a step or hands it to the operator is decided two ways. For a **template**, the step's own `mode`: `print` (default) surfaces the ready-to-run command and stops for the operator; `exec` has the agent run it via the **Bash** tool and relay the findings. For a **slash command**, the target skill's `disable-model-invocation` — codex's review commands set it, so they're operator-run (the agent can't invoke them via the SlashCommand tool). The `exec`/Bash route is legitimate precisely because `disable-model-invocation` blocks only `SlashCommand`, not Bash. The default is **print**/operator-run, preserving the human checkpoint for expensive/external review; opt a step into `exec` deliberately.
- **Placeholders are stage-scoped, substituted by the resume/agent layer (never the renderer).** A template `run` may reference `{plan_dir}` (the materialized plan dir), `{base}` (the branch the plan forked from), `{diff_range}` (`merge-base(<base>,HEAD)..HEAD`), and `{focus}` (a composed review focus). The renderer records them verbatim — there's no diff at materialize time. The resuming agent substitutes them before running; the `/jidoka:plan-review-prompt` composer fills `{focus}` (and the rest) for plan-level review. `pre_review` runs before any unit, so only `{plan_dir}` is meaningful there.
- **codex commands are operator-run.** `/codex:review` and `/codex:adversarial-review` set `disable-model-invocation: true`, so a resuming agent cannot invoke them via the SlashCommand tool — they're surfaced for the human to run. They require `/codex:setup` + `codex login` (they fail loudly otherwise). If jidoka drives plan-level review, leave codex's own Stop-time `--enable-review-gate` off to avoid double-gating. (Running codex as a `{ run: "… codex exec …", mode }` **template** is the agent-run alternative — Bash, not SlashCommand — when you want the agent to drive it.)
- **`/jidoka:plan-review-prompt` drives the configured `plan_review` vehicle (tool-agnostic).** The resuming agent runs this bundled composer (it is agent-invocable); it reads the plan + cumulative diff, composes a cross-unit focus (seams, deferred forward-references that should now be wired up), and drives whatever `plan_review` configures: a `{ run, mode }` template for a generic tool — into which jidoka injects its **own** plan-level review prompt, then `print` (surface the command) or `exec` (run via Bash) — or a slash command like `/codex:adversarial-review`, into which it composes the focus for the operator. codex is one vehicle, not hardcoded; the agent does the aiming, the configured mode decides who runs it. **How the diff reaches the reviewer is read off the template's `run`:** a no-pipe skeleton (e.g. `codex exec -s read-only "{focus}"`) is *agentic* — the tool runs `git diff` itself from the range the composer puts in `{focus}`, paging it at its own pace so an extremely large diff never has to fit in one context window; a `git diff {diff_range} | …` skeleton *feeds* the diff in (the only option for a tool that can't run shell, but the whole diff then lands in the model's context, so it doesn't scale to very large plans).
- **`codex exec` arg form blocks on an open stdin pipe — close it with `< /dev/null` (the unattended-hang guard).** Per `codex exec --help`: "If stdin is piped and a prompt is also provided, stdin is appended as a `<stdin>` block." So when the prompt is passed as an **argument** and the command runs unattended — the Bash tool, a backgrounded / non-TTY shell, where stdin is an open pipe that never sends EOF — `codex exec` blocks forever (printing only `Reading additional input from stdin...`). It does *not* reproduce under an interactive TTY (no piped stdin → it just uses the arg), which is why it slips past foreground testing. The shipped default `plan_review` therefore ends in `< /dev/null`, and the `/jidoka:plan-review-prompt` composer appends it whenever it delivers `{focus}` as an argument. This is an **empty-stdin guard, not a diff feed** — it leaves the agentic-vs-feed delivery decision above untouched (the reviewer still fetches the diff itself). It does **not** apply to the `codex exec -` stdin-prompt form or a `git diff … | codex exec` feed, where the prompt/diff *is* stdin and gets a clean EOF.

### Examples

Two worked `config.json` shapes (the `pre_review`/`unit_review`/`plan_review` slice; the file is parsed as JSONC, so `//` comments are allowed).

**Example A — slash commands throughout.** The pre-execution default, `/code-review` + a `/simplify` cleanup pass after each unit, and codex's adversarial review at plan-close. codex is operator-run (`disable-model-invocation`), so the `/jidoka:plan-review-prompt` composer aims it and hands you the ready-to-run command:

```jsonc
{
  "pre_review": ["/jidoka:pre-plan-review"],
  "unit_review": ["/code-review", "/simplify"],
  "plan_review": ["/codex:adversarial-review"]
}
```

**Example B — plan-level review fully agent-run** via a tool-agnostic `codex exec` template in `exec` mode. `codex exec` is agentic, so it fetches the diff itself (paging it at its own pace — this is what scales to a large plan); the composer fills `{focus}` with jidoka's own plan-level review prompt + the cross-unit targets + the diff range, runs it via Bash, and relays the findings — no operator step. The trailing `< /dev/null` is the stdin hang-guard (see *Command semantics & invocation*) — without it an unattended `exec` run blocks forever on its open stdin pipe:

```jsonc
{
  "pre_review": ["/jidoka:pre-plan-review"],
  "unit_review": ["/code-review"],
  "plan_review": [
    { "run": "codex exec -s read-only \"{focus}\" < /dev/null", "mode": "exec" }
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
