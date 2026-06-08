# Data Model & Execution Modes

Shared reference for both [agents](agent-guide.md) and [developers](developer-guide.md). Defines the contract between the skill (which produces plan markdown) and the renderer (which validates, materializes a plan dir, and visualizes any per-unit topologies).

## Plan vs. Topology

planview has **two** related but distinct shapes:

- **Plan** — the top-level output of `/planview`. A markdown document with a `# Title` H1 and a sequence of `## Unit NN: <title>` sections, materialized as a directory of markdown files (`overview.md`, `progress.md`, `0N-<unit-slug>.md`) plus an opt-in `overview.html`. Most plans are pure markdown — multi-agent diagrams aren't the headline anymore.
- **Topology** — an optional shape that lives **inside a Unit** when that unit dispatches multiple agents in a meaningful structure. Embedded as a ` ```topology ` fenced JSON block inside the unit body; the parser extracts it, validates it, attaches it to the unit, and strips the fence so the renderer can draw the Mermaid diagram from the typed object instead of from the raw JSON code. Topology can also still be rendered standalone via the direct CLI (`echo '<topology-json>' | planview`) — that path is kept for backwards compatibility and one-off diagrams.

A unit without multi-agent dispatch (the common case) carries no topology. A unit with one agent never carries a topology — it's just main doing the work.

## Plan markdown shape

This is what the skill emits and what the hook / `planview materialize` parses. The renderer auto-derives the slug, the unit IDs, and the default `blocked_by` chain — you don't write those.

```
# <task summary — used as the plan slug source>

<optional preamble paragraph(s); ignored by the parser>

## Unit 01: <title>

<one or two sentences — the unit summary>

<rest of the body — Tasks, Acceptance, Notes, etc.>

## Unit 02: <title>

<summary>

<body, including an optional `\`\`\`topology` fence when this unit dispatches multiple agents>
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
  topology?: Topology;             // optional multi-agent dispatch shape
  // Materializer-attached at materialize time from `config.unit_review`;
  // never present on parsed input.
  review?: ReviewStep[];
}
```

### Plan JSON Schema (legacy)

`planview materialize` still accepts a JSON document of this shape (auto-detected when the input begins with `{`) for hand-written or scripted callers. The skill no longer emits this format — markdown is the primary interface.

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
      "body_markdown": "string",
      "topology": "Topology (optional)"
    }
  ]
}
```

Review pipelines aren't part of the wire format — the parser doesn't accept them and the skill doesn't produce them. They come from the user's config (`~/.claude/plugins/planview/config.json`) and are attached to the in-memory plan at materialize time. See [Review commands](#review-commands) below.

### Plan Field Semantics

| Field | Type | Description |
|---|---|---|
| `task_summary` | `string` | One-line description of the overall task. Becomes the `<title>` of the materialized HTML and the H1 of `overview.md`. |
| `slug` | `string` | Kebab-case, 1–60 chars, no leading/trailing hyphen. Becomes the trailing segment of the dir name `<YYMMDD>-<N>-<slug>`. |
| `units` | `Unit[]` | At least one unit. Order in the array doubles as default visual order. |
| `id` | `string` | `^[0-9]{2}-[a-z0-9-]+$`. The two-digit prefix is the in-plan ordinal; the file name is exactly `<id>.md`. |
| `title` | `string` | Heading text ("Unit 01 — `{title}`" in the unit md, "Unit 01 — `{title}`" in the HTML). |
| `summary` | `string` | One or two sentences. Shown above the body markdown in both md and HTML. |
| `blocked_by` | `string[]` | Unit ids this unit depends on. Must reference siblings in the same plan; cycles and self-deps are rejected at validation time. |
| `agents_involved` | `string[]?` | Optional labels for the unit metadata block. Omit for "main only". |
| `body_markdown` | `string` | The full body of the unit, embedded verbatim into `<id>.md` and re-rendered client-side for the HTML card. Typically `## Tasks`, `## Acceptance`, etc. |
| `topology` | `Topology?` | Optional. When set, validated with the standard topology rules and rendered as a per-unit Mermaid block. |
| `review` | `ReviewStep[]?` | Materializer-attached. A copy of `unit_review` from the user's config — each entry is a slash command or a `{ run, mode }` template, rendered verbatim as a Unit-md checkbox (templates show their `run` + a `print`/`exec` mode badge) and an HTML list item. |

## Topology Data Model (per-unit, optional)

```typescript
interface Topology {
  task_summary: string;            // informational when nested under a Unit
  execution_mode: "team" | "subagents";
  agents: Agent[];                 // 1-N agents
}

interface Agent {
  id: string;                              // unique within the topology, [a-zA-Z0-9_-]+ only
  role: string;                            // what this agent does
  model: "haiku" | "sonnet" | "opus";      // model selection
  tools: string[];                         // tools available to this agent
  blocked_by: string[];                    // agent IDs that must complete first
  background: boolean;                     // subagent mode only: fire-and-forget
  output: "inline" | { file: string };     // where agent writes output (default: "inline")
  produces?: string;                       // human description of output (2-5 words)
  execution_mode?: "team" | "subagents";   // set when agent dispatches sub-agents
  agents?: Agent[];                        // nested sub-agents (recursive)
}
```

### Topology JSON Schema

```json
{
  "task_summary": "string",
  "execution_mode": "team | subagents",
  "agents": [
    {
      "id": "string",
      "role": "string",
      "model": "haiku | sonnet | opus",
      "tools": ["string"],
      "blocked_by": ["string"],
      "background": false,
      "output": "inline | { \"file\": \"path\" }",
      "produces": "string (optional)",
      "execution_mode": "team | subagents (optional)",
      "agents": ["Agent[] (optional, recursive)"]
    }
  ]
}
```

When a Topology lives inside a Unit, its `task_summary` is **informational** — the Unit's `summary` is the canonical description of the work. The topology's `task_summary` still surfaces in the embedded mermaid block's surrounding context but doesn't override the unit-level framing.

### Agent Field Semantics

| Field | Type | Description |
|---|---|---|
| `task_summary` | `string` | One-line description (informational when topology is per-unit; canonical when topology is rendered standalone). |
| `execution_mode` | `"team" \| "subagents"` | How agents are orchestrated at this scope. |
| `agents` | `Agent[]` | The agents in this topology. |
| `id` | `string` | Unique identifier within the topology. `[a-zA-Z0-9_-]+` only (prevents HTML injection in Mermaid labels). |
| `role` | `string` | What this agent does. |
| `model` | `"haiku" \| "sonnet" \| "opus"` | Model selection. |
| `tools` | `string[]` | Tools available to this agent. |
| `blocked_by` | `string[]` | Agent IDs that must complete before this one starts. Scope-aware — references must be within the same nesting level. |
| `background` | `boolean` | Subagents mode only. `true` = fire-and-forget, `false` = wait for result. |
| `output` | `"inline" \| { file: string }` | Where the agent writes its output. Default: `"inline"`. |
| `produces` | `string?` | Human description of what this agent outputs (appears in topology overview). |
| `execution_mode` | `string?` | Set when this agent dispatches its own sub-agents. |
| `agents` | `Agent[]?` | Nested sub-agents (recursive structure). |

## Execution Modes

### Subagents

The main agent dispatches focused subtasks. It orchestrates in rounds:

1. Dispatch all unblocked agents (empty `blocked_by`) in parallel
2. Wait for them to complete
3. Process results, dispatch the next batch of unblocked agents
4. Repeat until done

Each round is a phase. The diagram shows one Mermaid graph per phase. Phase labels appear when there are multiple phases. If there's only one phase, a single graph is shown without a label.

Agents don't communicate with each other. All data flows through the main agent (hub-and-spoke).

### Team

The main agent creates the team via `TeamCreate` and spawns agents. Agents self-coordinate using `SendMessage` and the shared task list. `blocked_by` is enforced through task dependencies.

The diagram shows a single graph with all team agents inside a rectangle (communication boundary). Phasing is shown through arrows, not separate graphs.

### What the Arrows Mean

In both modes, `blocked_by` expresses intended execution order and data flow — not enforced communication channels.

- **In subagents mode:** effectively enforced. The main agent won't dispatch an agent until its blockers complete.
- **In team mode:** handled by the task system. Agents are free to communicate with anyone via `SendMessage`. The arrows show the planned data flow.

The topology is advisory. It shows the intended plan.

### Nested Agents

Agents can dispatch their own sub-agents by including `execution_mode` and `agents` fields. Nested agents are rendered as regular nodes with edges to their children. If the nested execution mode is `"team"`, children get a communication boundary rectangle. Subagent children are rendered flat.

When both modes appear in a topology (e.g., top-level subagents with a nested team), the rendered combined mode is `"subagents + team"`.

### Output Strategies

| Strategy | Behavior | Diagram shape |
|---|---|---|
| `"inline"` | Result returns to the caller's context window | Rectangle |
| `{ "file": "path" }` | Agent writes output to a file | Stadium/pill |

The `produces` field describes what an agent outputs in human terms. It appears in the topology overview text.

## Review commands

Review commands come from the user's config at `~/.claude/plugins/planview/config.json` (scaffolded by `planview:setup`; hand-edited afterward). The materializer copies them onto each Unit (rendered into the Unit md), onto the Plan as a pre-execution checklist (rendered into `progress.md` as `## Pre-execution review`), and onto the Plan as a post-execution checklist (rendered into `progress.md` as `## Plan-level review`).

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
| Pre-execution | `pre_review` | `progress.md` (`## Pre-execution review`, above Done) | `["/planview:pre-plan-review"]` | On the first session, before Unit 01 — the resuming agent works through it against the freshly materialized plan dir, then stops: it auto-runs the agent-invocable steps (the default `/planview:pre-plan-review`, or an `exec` template) and surfaces any `print` template / operator-run slash command for the human. Reviews the plan *as a plan* — no diff exists yet. |
| Per-unit | `unit_review` | Each `<id>.md` (`## Review pipeline`) | `["/code-review"]` | After the unit's diff lands and before it's committed. Local correctness gate on the unit's working-tree diff. |
| Plan-level | `plan_review` | `progress.md` (`## Plan-level review`, below Notes) | `[]` | After the last unit's review lands and is committed. Adversarial pass against the cumulative *committed* plan diff — the completeness net for cross-unit issues. |

### Validation

The materializer denies the ExitPlanMode hook (or fails the `materialize` CLI) when an entry is neither a non-empty string starting with `/` nor a `{ run, mode }` template (`run` a non-empty string; `mode` one of `print`/`exec`, defaulting to `print`; no unknown keys). Otherwise every entry is rendered verbatim — the renderer never substitutes placeholders or runs anything.

Review steps are **global-config-only**: the per-repo `.planview.json` override allow-list excludes `pre_review`/`unit_review`/`plan_review`, so a cloned repo's committed config can never make a resuming agent run arbitrary shell. This is the security boundary that makes `exec` (below) safe.

### Command semantics & invocation

planview renders commands verbatim; it does not run them. These properties of the common review commands shape what belongs in each stage:

- **Namespace trap.** Built-in `/code-review` reviews a **local working-tree diff** (correctness bugs + reuse/simplification/efficiency cleanups). `/code-review:code-review` is a *different* tool — the code-review plugin, which reviews a **GitHub PR**. Per-unit and plan-level gates operate on local diffs, so they want the built-in `/code-review`, not the PR plugin.
- **No `--fix` on unit review.** Unit review runs mid-plan with no plan context, so it flags intentional forward-references (a function unit 01 adds but unit 03 wires up reads as "unused"). Findings are therefore *candidates* a plan-aware reviewer triages, not edits to auto-apply — `--fix` would "fix" a correct forward-reference by deleting it.
- **No focus argument.** `/code-review` (and `/codex:review`) take no free-text focus. Per-unit review focus belongs in the **unit body prose**, where the triager reads it. `/codex:adversarial-review` is the exception — it accepts free-form focus text, useful for aiming the plan-level pass at cross-unit consistency.
- **`/simplify` is cleanup-only.** It applies reuse/simplification/efficiency/altitude fixes and does **not** hunt bugs — a complement to `/code-review`, not a substitute.
- **Plan-level diff is committed.** By plan-end every unit is committed, so the cumulative diff lives between the base branch and HEAD. A bare working-tree review sees nothing; pass a base ref: `/codex:adversarial-review --base <branch>` (reviews `merge-base..HEAD`) or `/code-review <branch>`.
- **Two-mechanism invocation (operator-run vs agent-run spans all three stages).** Whether a resuming agent runs a step or hands it to the operator is decided two ways. For a **template**, the step's own `mode`: `print` (default) surfaces the ready-to-run command and stops for the operator; `exec` has the agent run it via the **Bash** tool and relay the findings. For a **slash command**, the target skill's `disable-model-invocation` — codex's review commands set it, so they're operator-run (the agent can't invoke them via the SlashCommand tool). The `exec`/Bash route is legitimate precisely because `disable-model-invocation` blocks only `SlashCommand`, not Bash. The default is **print**/operator-run, preserving the human checkpoint for expensive/external review; opt a step into `exec` deliberately.
- **Placeholders are stage-scoped, substituted by the resume/agent layer (never the renderer).** A template `run` may reference `{plan_dir}` (the materialized plan dir), `{base}` (the branch the plan forked from), `{diff_range}` (`merge-base(<base>,HEAD)..HEAD`), and `{focus}` (a composed review focus). The renderer records them verbatim — there's no diff at materialize time. The resuming agent substitutes them before running; the `/planview:plan-review-prompt` composer fills `{focus}` (and the rest) for plan-level review. `pre_review` runs before any unit, so only `{plan_dir}` is meaningful there.
- **codex commands are operator-run.** `/codex:review` and `/codex:adversarial-review` set `disable-model-invocation: true`, so a resuming agent cannot invoke them via the SlashCommand tool — they're surfaced for the human to run. They require `/codex:setup` + `codex login` (they fail loudly otherwise). If planview drives plan-level review, leave codex's own Stop-time `--enable-review-gate` off to avoid double-gating. (Running codex as a `{ run: "… codex exec …", mode }` **template** is the agent-run alternative — Bash, not SlashCommand — when you want the agent to drive it.)
- **`/planview:plan-review-prompt` drives the configured `plan_review` vehicle (tool-agnostic).** The resuming agent runs this bundled composer (it is agent-invocable); it reads the plan + cumulative diff, composes a cross-unit focus (seams, deferred forward-references that should now be wired up), and drives whatever `plan_review` configures: a `{ run, mode }` template for a generic tool — into which planview injects its **own** plan-level review prompt, then `print` (surface the command) or `exec` (run via Bash) — or a slash command like `/codex:adversarial-review`, into which it composes the focus for the operator. codex is one vehicle, not hardcoded; the agent does the aiming, the configured mode decides who runs it. **How the diff reaches the reviewer is read off the template's `run`:** a no-pipe skeleton (e.g. `codex exec -s read-only "{focus}"`) is *agentic* — the tool runs `git diff` itself from the range the composer puts in `{focus}`, paging it at its own pace so an extremely large diff never has to fit in one context window; a `git diff {diff_range} | …` skeleton *feeds* the diff in (the only option for a tool that can't run shell, but the whole diff then lands in the model's context, so it doesn't scale to very large plans).

### Terminology

| Term | Meaning |
|---|---|
| Plan | The top-level shape: a list of units with sequential ids and dependencies. Materialized to `<plan_dir_root>/<YYMMDD-N-slug>/` (default `docs/exec-plans/active/`). |
| Unit | One step in a plan. Reviewable on its own. Materialized to `<id>.md`. |
| Topology | Per-unit (optional) multi-agent dispatch shape. Rendered as a Mermaid block inside the unit's md and HTML card. |
| Phase | A wave of work derived from `blocked_by` dependencies inside a topology. In subagents mode, the main agent dispatches each phase explicitly. |
| Step (topology) | Numbered items in the topology overview. The dependency-derived order within a phase. Parallel agents share a step with letter suffixes (2a, 2b). |
| Review step | An entry in `pre_review`, `unit_review`, or `plan_review`: a Claude Code slash command **or** a `{ run, mode }` bash template. Rendered verbatim as a checkbox in the materialized plan (templates carry a `print`/`exec` mode badge). |
| Pre-execution review | The `progress.md` section rendered from `pre_review`, between the cursor line and Done. On the first session the resuming agent auto-runs the agent-invocable steps and surfaces any `print`/operator-run step, then stops before Unit 01; reviews the plan as a plan. |
| Plan-level review | The `progress.md` section rendered from `plan_review`. Surfaces after every Unit is reviewed and committed; the resume protocol stops here and asks the user before archiving. |
