# Developer Guide: Building the Renderer

Self-contained reference for rebuilding planview in any language. See [Data Model](data-model.md) for the JSON schema that serves as the contract between skill and renderer, and [Agent Guide](agent-guide.md) for the skill's behavior and heuristics.

## System Architecture

Two components with a strict boundary between them.

```
User types /planview <task>
      |
      v
+- SKILL (forked subagent) ----------------------+
|                                                 |
|  LLM analyzes task -> produces topology JSON    |
|  Saves JSON to /tmp/planview-{id}.json    |
|  Returns topology JSON (one-shot)               |
+------------------+-----------------------------+
                   |
                   |  (if --open flag)
+------------------v-----------------------------+
|  RENDERER (compiled binary)                     |
|                                                 |
|  Validates JSON -> Mermaid graphs               |
|  -> topology overview -> HTML -> browser        |
+------------------------------------------------+

ExitPlanMode -> PreToolUse hook -> RENDERER (with plan from disk)
```

### Skill (SKILL.md)

Runs in a forked subagent (`context: fork`). One-shot generator: analyzes the task, produces topology JSON, saves it to a session-namespaced temp file, returns. All planning context stays in the fork. Main agent only sees the returned JSON.

The skill handles everything requiring LLM judgment: task analysis, agent decomposition, execution mode selection. It never generates HTML.

### Renderer (src/)

Deterministic CLI. Handles everything mechanical: validation, diagram generation, HTML output, browser launch. Never calls the LLM.

```
topology JSON -> validate -> graph -> mermaid  -+
                                   -> describe  -+-> html -> browser
```

`graph` does topological sort (shared by both `mermaid` and `describe`).

### The Contract

```bash
echo '<topology JSON>' | planview
# or
planview path/to/topology.json
```

- **Input:** topology JSON on stdin or file path argument
- **Stdout:** path to generated HTML file
- **Stderr:** error messages only
- **Exit code:** 0 success, non-zero failure

This boundary makes the renderer replaceable. Swap in a different binary with the same contract, and the skill works unchanged.

## Validation Rules

The validator enforces these constraints on the topology JSON. Every rule must be reproduced in a rewrite.

### Structural Rules

1. Input must be a non-null object
2. `task_summary` must be a non-empty string
3. `execution_mode` must be `"team"` or `"subagents"`
4. `agents` must be a non-empty array

### Per-Agent Rules

5. `id` must be a non-empty string matching `^[a-zA-Z0-9_-]+$`
6. `id` must be globally unique across all agents (including nested)
7. `role` must be a non-empty string
8. `model` must be one of `"haiku"`, `"sonnet"`, `"opus"`
9. `tools` must be an array of strings
10. `blocked_by` must be an array of strings
11. `background` must be a boolean
12. `output` (if present) must be `"inline"` or `{ "file": "<non-empty-path>" }`
13. `produces` (if present) must be a string
14. `execution_mode` (if present) must be `"team"` or `"subagents"`
15. `agents` (if present) must be a non-empty array (no empty arrays)

### Dependency Rules (Scope-Aware)

These are checked per scope — each level of nesting is validated independently:

16. Every `blocked_by` entry must reference an existing agent ID in the same scope (not a parent or child scope)
17. No agent can block itself (self-dependency)
18. The dependency graph must be acyclic — checked via DFS with a recursion stack

### Normalization

After validation, the `output` field defaults to `"inline"` if not provided.

## Core Algorithms

### Topological Sort (Step Assignment)

Assigns a step number to each agent via DFS on `blocked_by`:

- Agents with no blockers get step 1
- Agents blocked by step-N agents get step N+1
- Parallel agents share the same step number

```
function assignSteps(agents):
  depths = empty map
  agentsById = map from id -> agent

  function getDepth(agentId):
    if depths has agentId: return depths[agentId]
    agent = agentsById[agentId]
    if agent.blocked_by is empty:
      depths[agentId] = 1
      return 1
    maxBlockerDepth = max(getDepth(b) for b in agent.blocked_by)
    depth = maxBlockerDepth + 1
    depths[agentId] = depth
    return depth

  for each agent: getDepth(agent.id)
  return depths

function groupByStep(agents):
  steps = assignSteps(agents)
  grouped = map from step -> [agents]
  sorted = grouped keys, sorted ascending
  return { sorted, grouped }
```

### Mermaid Graph Generation

#### Rendering Rules

- Arrows = dispatch/dependency (same for subagents and teams)
- Rectangle (Mermaid `subgraph`) = communication boundary (team agents that can talk to each other)
- Subagents mode: one graph per phase (main orchestrates between phases)
- Team mode: single graph, all team agents in one rectangle
- Nested agents: always regular nodes with edges to children

#### Node Shapes

- Rectangle `["label"]` for inline output
- Stadium/pill `(["label"])` for file output
- Double circle `(("main agent"))` for the main agent node

#### Model-Based Coloring (CSS Classes)

| Model | Fill | Stroke | Color |
|---|---|---|---|
| `haiku` | `#dbeafe` | `#3b82f6` | `#1e3a5f` (blue) |
| `sonnet` | `#dcfce7` | `#22c55e` | `#14532d` (green) |
| `opus` | `#ede9fe` | `#8b5cf6` | `#3b0764` (purple) |
| `main` | `#fef3c7` | `#f59e0b` | `#78350f` (amber) |

Node labels: `{id} ({model})`

Mermaid ID escaping: hyphens in agent IDs are converted to underscores (Mermaid doesn't support hyphens in node IDs).

#### Subagents Mode Algorithm

```
for each step in sorted order:
  create "graph TD"
  add classDef block (haiku, sonnet, opus, main)
  add main agent node (double circle, main class)
  for each agent in this step:
    render agent tree (node + descendants)
  add edges: main --> each agent in this step
  add nested edges from agent trees
```

#### Team Mode Algorithm

```
create single "graph TD"
add classDef block
add main agent node
open subgraph "team" (communication boundary rectangle)
  for each agent:
    render agent tree
close subgraph
add edges: main --> each root agent (those with empty blocked_by)
add blocked_by edges between agents
add nested edges
```

#### Agent Tree Rendering (Recursive)

```
function renderAgentTree(agent, indent):
  emit node definition for agent
  if agent has nested agents:
    if agent.execution_mode == "team":
      open subgraph (communication boundary)
      render each child recursively (indented)
      close subgraph
    else:
      render each child recursively (no subgraph)
    for each child:
      if child.blocked_by is empty:
        emit edge: parent --> child
      for each blocker in child.blocked_by:
        emit edge: blocker --> child
```

### Description Generation (Topology Overview)

Generates a human-readable text overview with step numbering:

```
function generateDescription(topology):
  render(topology.agents, topology.execution_mode, "the main agent", "", showPhaseHeaders=true)

function render(agents, executionMode, fallbackTarget, indent, showPhaseHeaders):
  group agents by step
  multiPhase = showPhaseHeaders AND executionMode == "subagents" AND multiple steps

  for each step:
    if multiPhase: emit "Phase N" header
    for each agent in step:
      letter = if parallel agents: a, b, c... else: ""
      stepNum = if multiPhase: always 1 (reset per phase), else: actual step
      emit "{stepNum}{letter}. {agent.id} ({agent.model})"
      emit "  tools: {comma-separated tools}"
      if agent has nested agents:
        recurse with child agents
      emit output context line
```

#### Output Context Formatting

- **File output:** writes `"{produces}"` to `{path}`
- **Team mode with downstream dependents:** passes `"{produces}"` to `{dependent-ids}`
- **Default (inline, returning to caller):** returns `"{produces}"` to `{fallbackTarget}`

The `fallbackTarget` is `"the main agent"` at the top level, or the parent agent's ID for nested agents.

### HTML Generation

Combines Mermaid graphs + description + optional plan into a self-contained HTML page:

- **Title:** `Topology: {task_summary}`
- **Mermaid CDN:** `mermaid@11.12.2`
- **If plan panel present:** `marked@15.0.7` (markdown parsing) + `dompurify@3.2.4` (sanitization)
- CSS and JS are embedded inline (embedded at build time via `include_str!()` from `style.css` and `script.js`)
- Plan content is injected as `window.__planMarkdown` for client-side rendering

#### Layout Modes

- **Without plan:** single column with diagram, legend, topology overview
- **With plan:** two-column split — plan (left) + diagram (right)

**Legend:** Shows model color swatches (haiku/sonnet/opus) and output shape indicators (rectangle=inline, pill=file).

#### Client-Side JS Features

- Theme toggle (light/dark)
- Download diagram as PNG
- Plan markdown rendering (via marked + DOMPurify)
- Mermaid initialization

## CLI Interface

```
planview v0.2.4

Usage:
  planview <file>              Render a topology JSON file
  echo '<json>' | planview     Read from stdin
  planview --example           Render the built-in showcase
  planview --example --json    Dump the showcase JSON to stdout
  planview <file> --mermaid    Output raw Mermaid graph definitions
  planview <file> --plan <plan.md>  Render with plan panel
  planview hook                Process ExitPlanMode hook from stdin
  planview index <dir>         Generate index.html for a directory of JSON files

Options:
  -h, --help       Show this help message
  -v, --version    Show version number
  --mermaid        Output Mermaid definitions to stdout instead of HTML
  --plan <file>    Show plan markdown alongside the topology diagram
  --schema         Dump the topology JSON schema to stdout
  --validate       Validate JSON without rendering (exit 0 = valid, exit 1 = invalid with errors on stderr)
```

### Mode Details

- **Normal mode** (default): Read JSON from file/stdin, validate, render HTML, write to temp file, open browser. Stdout: HTML file path. Exit 0 on success, 1 on error.
- **Hook mode** (`planview hook`): Process ExitPlanMode PreToolUse hook input from stdin. See [Hook Integration](#hook-integration) for full details. Always exits 0 (never blocks ExitPlanMode).
- **Index mode** (`planview index <dir>`): Scan a directory for `*.json` files, generate an `index.html` gallery page with iframe previews of each topology.
- **Mermaid mode** (`--mermaid`): Output raw Mermaid graph definitions to stdout instead of generating HTML. Useful for embedding in markdown.

### Environment Variables

| Variable | Effect |
|---|---|
| `PLANVIEW_NO_OPEN` | If set, don't open the browser (just write HTML and print path) |
| `PLANVIEW_NO_AUTO` | If set, don't auto-invoke (hook silently exits when no topology file exists) |
| `CLAUDE_PLANS_DIR` | Override default `~/.claude/plans` location |
| `CLAUDE_SESSION_ID` | Used by the skill to namespace temp files |
| `TMPDIR` | Override default `/tmp` for HTML output |

## Plugin Manifest

```json
{
  "name": "planview",
  "skills": ["SKILL.md"],
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          { "type": "command", "command": "planview hook || true" }
        ]
      }
    ]
  }
}
```

The `|| true` ensures the hook command always exits 0 at the shell level, even if the binary crashes. The binary itself also always exits 0 internally.

## Hook Integration

### Why PreToolUse, Not PostToolUse

This is an empirical discovery about Claude Code's hook system. PostToolUse fires after the user has already approved or rejected the tool call:

| ExitPlanMode outcome | Plan data in payload? | Useful for review? |
|---|---|---|
| Approved | Yes (`tool_response.plan`, `tool_response.filePath`) | No — user already decided |
| Rejected | No (plain error string) | N/A — no data to show |

PostToolUse is structurally incompatible with "review before approval."

### Timeline

PreToolUse fires before the user sees the approval dialog:

1. Agent writes plan to `~/.claude/plans/<name>.md`
2. Agent calls ExitPlanMode
3. **>> PreToolUse hook fires** (synchronous, blocks until complete)
4. Hook reads plan file from disk
5. Hook reads topology from `/tmp/planview-{session_id}.json`
6. Hook renders combined HTML, opens browser
7. User sees ExitPlanMode approval dialog in CLI
8. User reviews combined plan+diagram in browser while deciding
9. User approves or rejects

### Plan Resolution

PreToolUse has no `tool_response` (the tool hasn't run yet). The hook scans `~/.claude/plans/` for the most recently modified `.md` file and reads it directly from disk.

This is reliable because PreToolUse hooks fire synchronously — the agent writes the plan file and calls ExitPlanMode in the same response. No other processing happens between file write and hook read.

### Hook Flow

```
Hook receives stdin JSON: { "session_id": "...", "tool_name": "ExitPlanMode", "tool_input": {} }
  |
  +-- Extract session_id
  +-- Check /tmp/planview-{session_id}.json exists
  |
  +- [topology exists]
  |   +-- Read topology JSON -> validate -> generate mermaid + description
  |   +-- Scan ~/.claude/plans/ for most recently modified .md
  |   +-- Generate combined plan+diagram HTML -> open browser
  |   +-- Exit 0
  |
  +- [topology missing]
      +-- PLANVIEW_NO_AUTO set? -> exit 0 (opt-out)
      +-- Marker file exists with attempts >= 3? -> exit 0 (give up)
      +-- Write marker (increment attempt count) -> deny via hookSpecificOutput -> exit 0
```

### Auto-Invoke via Deny

Hooks are deterministic shell processes — they can gate (allow/deny) but can't invoke skills or call the LLM. The only way a hook can trigger LLM work is to deny the tool call with an instruction in the reason string:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "BLOCKED: You must run /planview with a summary of your plan before exiting plan mode. After /planview completes, you MUST call ExitPlanMode again to finish."
  }
}
```

The agent sees the deny, follows the instruction (runs `/planview`), and retries ExitPlanMode.

### Infinite Loop Prevention

A marker file (`/tmp/planview-{session_id}.attempted`) tracks how many times the hook has denied. After 3 attempts, the hook silently falls through (exits 0 without denying). This prevents infinite denial loops if the skill fails repeatedly.

### Critical: Always Exit 0

PreToolUse hooks block the tool if they return a non-zero exit code. The hook must always return 0 — even on errors — to avoid permanently blocking ExitPlanMode.

## Design Decisions

| Decision | Rationale |
|---|---|
| Produce-only, no execution | The topology is a composable output. Users incorporate it into their existing workflows rather than being locked into a closed pipeline. |
| `context: fork` for planning | Planning context stays in the forked subagent. Main agent only sees the returned JSON. No context window pollution. |
| Skill + renderer split | LLM handles judgment (decomposition); renderer handles deterministic work (diagrams, HTML). Zero tokens spent on rendering. |
| JSON as contract | Single boundary between skill and renderer. Both sides validate independently. Changes to one side don't break the other. |
| Subagents = per-phase graphs | Each graph represents a real dispatch round. The diagram structure matches the actual execution model. |
| Team = single graph | The team is one communication boundary. Phasing is shown through arrows, not separate graphs. Agents persist across phases. |
| Topology overview derived, not authored | Computed from JSON via topological sort. Always consistent with the graph — can't drift. |
| One-shot skill, caller-driven iteration | `AskUserQuestion` doesn't surface inside forks. Skill generates and returns; caller handles adjust loop. Each adjustment is a full regeneration — no state to preserve. |
| Rust compile to single binary | No runtime dependencies for end users. |
| Mermaid via CDN | Simplest browser visualization for V1. Renderer internals are replaceable without changing the skill. |
| Arrows = dispatch, rectangle = communication | Arrows show data flow and execution order (same for both modes). Rectangles show communication boundaries. Separates execution order from communication scope. |
| Nested agents are regular nodes | Same shape regardless of nesting. Nesting shown by arrows, not containers. Keeps visual language simple: node = agent, arrow = flow, rectangle = communication. |
| Hook-driven enforcement via deny | Hooks can gate but can't invoke skills or call the LLM. The only way to trigger LLM work from a hook is to deny with an instruction. |
| Regenerate on adjust, don't patch | Full rebuild from scratch is simpler and less error-prone than surgical edits. |

### Post-v1: MCP Server

Deferred per [research/cli-vs-mcp.md](../research/cli-vs-mcp.md). The CLI binary (`echo JSON | planview`) is already the agent-agnostic interface — any agent that can shell out can use it. An MCP server wrapping the same binary is the natural next step for agents that prefer tool-calling over subprocess invocation, but adds no capability that the CLI doesn't already provide.

## Rendering Backend

Mermaid via CDN — the only evaluated option with native stadium/pill and double circle shapes matching planview's visual language. The renderer architecture is swappable — `mermaid.rs` can be replaced with `graphviz.rs` without changing any other pipeline stage (validate, graph, describe, html shell). Graphviz WASM (778 KB, gold-standard layout) is the strongest alternative if Mermaid limitations become blocking. See [research/diagram-rendering.md](../research/diagram-rendering.md) for the full evaluation.

## Development Setup

### Building

```bash
cargo build --release
```

### Making the binary available

Symlink the release binary into `~/.local/bin` so the `planview` command is available system-wide without reinstalling after each build:

```bash
ln -sf "$(pwd)/target/release/planview" ~/.local/bin/planview
```

This is a one-time setup. Subsequent `cargo build --release` runs overwrite the binary in place — the symlink picks up the new version automatically.

> **Prerequisite:** `~/.local/bin` must be on your `$PATH`. Most shells include it by default. If not, add `export PATH="$HOME/.local/bin:$PATH"` to your shell profile.

## Platform Constraints

- **macOS only for V1:** uses `open` for browser launch (code has `win32: "start"` and fallback `xdg-open` but untested)
- **Rust required:** cargo for build/test/compile, single binary via `cargo build --release`
- **No LLM calls in renderer:** the renderer is deterministic I/O only
- **Session-scoped temp files:** `/tmp/planview-{session_id}.json` prevents collisions between concurrent Claude Code sessions
- **Plans directory:** `~/.claude/plans/` is a Claude Code internal, may change (configurable via `CLAUDE_PLANS_DIR`)
