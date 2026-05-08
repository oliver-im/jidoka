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
}

interface Unit {
  id: string;                      // ^[0-9]{2}-[a-z0-9-]+$ (e.g. "01-housekeeping")
  title: string;
  summary: string;
  blocked_by: string[];            // unit ids in the same plan
  agents_involved?: string[];      // free-form labels for the unit metadata
  review_steps: string[];          // ["/code-review:code-review", "agent-cli", ...]
  body_markdown: string;           // the full unit body — Tasks, Acceptance, etc.
  topology?: Topology;             // optional multi-agent dispatch shape
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
      "review_steps": ["string"],
      "body_markdown": "string",
      "topology": "Topology (optional)"
    }
  ]
}
```

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
| `review_steps` | `string[]` | Slash-commands or human-readable strings (e.g. `/code-review:code-review`, `agent-cli`, `manual smoke per acceptance`). Rendered as a checklist in the unit md and HTML card. |
| `body_markdown` | `string` | The full body of the unit, embedded verbatim into `<id>.md` and re-rendered client-side for the HTML card. Typically `## Tasks`, `## Acceptance`, etc. |
| `topology` | `Topology?` | Optional. When set, validated with the standard topology rules and rendered as a per-unit Mermaid block. |

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

### Terminology

| Term | Meaning |
|---|---|
| Plan | The top-level shape: a list of units with sequential ids and dependencies. Materialized to `<plan_dir_root>/<YYMMDD-N-slug>/` (default `plan/`). |
| Unit | One step in a plan. Reviewable on its own. Materialized to `<id>.md`. |
| Topology | Per-unit (optional) multi-agent dispatch shape. Rendered as a Mermaid block inside the unit's md and HTML card. |
| Phase | A wave of work derived from `blocked_by` dependencies inside a topology. In subagents mode, the main agent dispatches each phase explicitly. |
| Step | Numbered items in the topology overview. The dependency-derived order within a phase. Parallel agents share a step with letter suffixes (2a, 2b). |
