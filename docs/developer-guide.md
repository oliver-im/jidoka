# Developer Guide: Building the Renderer

Self-contained reference for rebuilding planview in any language. See [Data Model](data-model.md) for the typed shapes (Plan + per-unit Topology) and the plan markdown surface, and [Agent Guide](agent-guide.md) for the skill's behavior and heuristics.

## System Architecture

Two components with a strict boundary between them.

```
User types /planview <task>
      |
      v
+- SKILL (forked subagent) -------------------------+
|                                                    |
|  LLM analyzes task -> produces plan markdown       |
|    (# Title H1 + ## Unit NN: headings + bodies +   |
|    optional ```topology fences inside units)       |
|  Returns markdown to caller (one-shot)             |
+------------------+--------------------------------+
                   |
                   v  (caller calls ExitPlanMode with markdown as `plan` arg)
+------------------v--------------------------------+
|  RENDERER (bundled dist/cli.js, hook mode)         |
|                                                    |
|  Reads tool_input.plan from PreToolUse stdin       |
|  parse_plan_markdown -> validate_plan ->           |
|  materialize_at writes <plan_dir_root>/            |
|     <YYMMDD-N-slug>/{overview,progress,0N-*.md};   |
|  html + browser opt-in                             |
+----------------------------------------------------+

Direct topology rendering (legacy path, unchanged):
  echo '<topology-json>' | planview  ->  /tmp/*.html
```

### Skill (SKILL.md)

Runs in a forked subagent (`context: fork`). One-shot generator: analyzes the task, produces **plan markdown**, returns it to the caller. All planning context stays in the fork. Main agent only sees the returned markdown and decides what to do with it.

The skill handles everything requiring LLM judgment: task analysis, unit decomposition, optional per-unit topology, body prose. It never saves to disk, never generates HTML, never calls the renderer, never executes the plan.

### Renderer (ts/)

Deterministic CLI. Handles everything mechanical: parsing, validation, plan dir materialization, HTML output, browser launch. Never calls the LLM.

```
plan markdown (from PreToolUse stdin's tool_input.plan, or from a file/stdin)
  -> parse_plan_markdown      (extracts title/units/summaries/bodies; lifts ```topology fences)
  -> validate_plan            (re-validates each lifted topology with path prefixes)
  -> materialize:
       resolve_target_dir -> materialize_at
         -> build_overview_md / build_progress_md / build_unit_md
            -> atomic_write per file
       write_plan_html         (when html_output=true; embeds overview.md)
  -> open_browser              (when auto_open_browser=true and !PLANVIEW_NO_OPEN)

Per-unit topology (when extracted from a fence):
  validate_topology_into       (path-prefixed: units[N].topology.agents…)
  -> mermaid::generate         (used by both unit md ```mermaid blocks and HTML pre.mermaid)
```

`graph` does topological sort for the topology layer (shared by both `mermaid` and `describe`).

### The Contracts

**Hook contract** (the primary path):

```
ExitPlanMode fires with markdown in tool_input.plan
  -> hook reads stdin, extracts tool_input.plan
  -> parse_plan_markdown + validate_plan
  -> materializes <project>/<plan_dir_root>/<YYMMDD-N-slug>/
  -> opens overview.html (when configured)
  -> exits 0
```

**Direct CLI contracts** (kept for backwards compatibility and one-off use):

```bash
# Plan path:
planview materialize <plan.md>            # parses markdown, writes plan dir + overview.html
planview materialize - < plan.md          # same, via stdin
planview materialize <legacy-plan.json>   # legacy Plan JSON also accepted (auto-detected)

# Topology path (legacy, standalone):
echo '<topology-json>' | planview         # writes /tmp/*.html, opens browser
planview <topology.json>                  # same
planview --example                        # built-in showcase
```

The skill never invokes the binary. Renderer-skill separation is preserved.

## Validation Rules

The validator enforces two layered rule sets — one for the top-level Plan, one for each (optional) embedded Topology. `validate_plan` runs both; `validate` runs only the topology layer for the standalone CLI path.

### Topology Rules (per topology, including embedded)

#### Structural

1. Input must be a non-null object
2. `task_summary` must be a non-empty string
3. `execution_mode` must be `"team"` or `"subagents"`
4. `agents` must be a non-empty array

#### Per-agent

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

#### Dependency (scope-aware)

These are checked per scope — each level of nesting is validated independently:

16. Every `blocked_by` entry must reference an existing agent ID in the same scope (not a parent or child scope)
17. No agent can block itself (self-dependency)
18. The dependency graph must be acyclic — checked via DFS with a three-color recursion stack

When a topology lives inside a Unit, all of the above run with paths prefixed by `units[N].topology.agents…` so the user can locate the offending agent across plan + topology.

### Plan Rules (top-level)

19. `task_summary` must be a non-empty string
20. `slug` must match `^[a-z0-9-]+$`, length 1–60, no leading/trailing hyphen
21. `units` must be a non-empty array
22. Each unit's `id` must match `^[0-9]{2}-[a-z0-9-]+$`
23. Unit `id` must be unique within the plan
24. Each unit's `title` and `summary` must be non-empty
25. `blocked_by` references must resolve to existing unit IDs in the same plan
26. No unit can block itself
27. The unit dependency graph must be acyclic
28. If `topology` is present, run rules 1–18 against it (path-prefixed as above)

### Normalization

After validation, the topology's `output` field defaults to `"inline"` if not provided.

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
Usage:
  planview <file>                      Render a topology JSON file
  echo '<json>' | planview             Read topology JSON from stdin
  planview --example                   Render the built-in showcase
  planview --example --json            Dump the showcase JSON to stdout
  planview <file> --mermaid            Output raw Mermaid graph definitions
  planview <file> --plan <plan.md>     Render topology with plan panel
  planview materialize <plan.md>       Materialize a plan markdown into <plan_dir_root>/
  planview materialize - < plan.md     Materialize plan markdown from stdin
                                       (legacy Plan JSON is also accepted; format auto-detected)
  planview hook                        Process ExitPlanMode hook from stdin

Options:
  -h, --help          Show this help message
  -v, --version       Show version number
  --mermaid           Output Mermaid definitions to stdout instead of HTML
  --plan <file>       Show plan markdown alongside the topology diagram
  --schema            Dump the topology JSON schema to stdout
  --validate          Validate JSON without rendering (topology only)

Materialize subcommand options:
  --plans-root <dir>  Override <project>/<plan_dir_root>
  --today <YYMMDD>    Override the date prefix (default: local `date +%y%m%d`)
```

### Mode Details

- **Normal mode** (default): Read topology JSON from file/stdin, validate, render HTML, write to temp file, open browser. Stdout: HTML file path. Exit 0 on success, 1 on error.
- **Materialize mode** (`planview materialize`): Read a plan from file (or stdin when the file argument is `-`), auto-detect markdown vs legacy JSON by the first non-whitespace character (`{` → JSON, otherwise markdown), validate, write `<plan_dir_root>/<YYMMDD-N-slug>/{overview,progress,0N-*}.md`. `overview.html` is written only when `html_output=true`; the browser opens only when `auto_open_browser=true` (both default off — see [Configuration](#configuration)). Plans root resolves from `$CLAUDE_PROJECT_DIR/<plan_dir_root>` (PWD fallback with stderr warning). Exit 0 on success, 1 on error.
- **Hook mode** (`planview hook`): Process ExitPlanMode PreToolUse hook input from stdin. See [Hook Integration](#hook-integration) for full details. Always exits 0 (never blocks ExitPlanMode).
- **Mermaid mode** (`--mermaid`): Output raw Mermaid graph definitions to stdout instead of generating HTML. Useful for embedding in markdown.

### Environment Variables

| Variable | Effect |
|---|---|
| `PLANVIEW_NO_OPEN` | If set, don't open the browser (just write the HTML and print the path) |
| `CLAUDE_PROJECT_DIR` | Project root used to resolve `<project>/<plan_dir_root>/`; PWD fallback with a stderr warning when unset (claude-code issue [#22343](https://github.com/anthropics/claude-code/issues/22343)) |
| `TMPDIR` | Override default `/tmp` for the topology renderer's HTML output |

## Configuration

The renderer reads a layered config: built-in defaults < `~/.claude/plugins/planview/config.json` (global) < `<project>/.planview.json` (project). Defined in `ts/config.ts`; loaded via `loadConfig(projectDir)` and threaded into the hook + materialize CLI paths.

| Key | Type | Default | Project override? | Notes |
|---|---|---|---|---|
| `plan_dir_root` | string | `plan` | yes (relative paths only, no `..`) | Where plan dirs land. Project paths are resolved against `$CLAUDE_PROJECT_DIR`. |
| `auto_open_browser` | bool | `false` | yes | Open `overview.html` after materialize. `PLANVIEW_NO_OPEN=1` always wins. |
| `html_output` | bool | `false` | yes | Write `overview.html` alongside the markdown. When false, only the `.md` files are produced. |
| `plan_level_topology` | bool | `false` | no | Reserved for v2; currently always false. |

### Loader behavior

- Missing files are not errors: layer falls through silently.
- Invalid JSON or shape mismatch on the global file: stderr warning, fall back to defaults.
- Project file may only set the keys marked above. Other keys are warn-and-ignored. Non-boolean values for the boolean keys are warn-and-ignored. `plan_dir_root` strings are validated (`isAbsolute` and `..` segments rejected) before being applied.
- `mergeForWrite(base, cfg)` round-trips the global file preserving any manually added keys — used by `planview:configure`.

### Daily counter

`materialize.ts` scans `plansRoot` only for entries matching `^<today>-(\d+)-` when picking the next `N`. Sibling dirs (a `backlog/`, `research/`, archived-plan tree, etc.) are deliberately not scanned: the user's filing convention does not belong in the code. An `N` previously occupied by an entry that has since been moved out of `plansRoot` can therefore reappear; rename at move-time if it bothers you.

### Skills

Two skills front the config UX (run outside the planning fork so `AskUserQuestion` works):

- `planview:setup` — first-run Q&A walkthrough that writes the global file from scratch. Triggered by phrases like "set up planview".
- `planview:configure` — diff-style edits that preserve manually added keys. Triggered by "change planview settings".

## Plugin Manifest

The plugin ships with `.claude-plugin/plugin.json` (metadata), `.claude-plugin/marketplace.json` (local-install marketplace), and `hooks/hooks.json` (the ExitPlanMode hook). Skills live at `skills/<name>/SKILL.md` and are auto-discovered by the plugin loader, so installing the plugin IS the prompt-injection — no per-project AGENTS.md needed.

```json
{
  "name": "planview",
  "version": "0.3.0",
  "description": "Materialize multi-unit plans …"
}
```

The hook in `hooks/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT/dist/cli.js\" hook" }]
      }
    ]
  }
}
```

`$CLAUDE_PLUGIN_ROOT` expands to the plugin install path, so no `planview` binary needs to be on `$PATH`. The bundle always exits 0 internally — there is no `|| true` shell guard, since a non-zero exit from `dist/cli.js` would indicate a bug we want to surface, not silently swallow. Hook errors land on stderr via the run() wrapper.

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

1. Agent (in plan mode) crystallizes a plan, runs `/planview`
2. Skill returns plan markdown to the main agent
3. Main agent calls `ExitPlanMode` with the markdown as the `plan` argument
4. **>> PreToolUse hook fires** (synchronous, blocks until complete)
5. Hook reads stdin, pulls the markdown out of `tool_input.plan`, parses + validates it
6. Hook materializes `<project>/<plan_dir_root>/<YYMMDD-N-slug>/`
7. Hook renders `overview.html` and opens it in the browser (when configured)
8. User sees ExitPlanMode approval dialog in CLI
9. User reviews the materialized plan + units in browser while deciding
10. User approves or rejects

### Hook Flow

```
Hook receives stdin JSON: { "session_id": "...", "tool_name": "ExitPlanMode", "tool_input": { "plan": "..." } }
  |
  +-- Validate session_id (path-safe)
  |
  +- [tool_input.plan is missing or whitespace-only]
  |   +-- exit 0 silently (no deny, no plan dir)
  |
  +- [tool_input.plan is non-empty]
      +-- parse_plan_markdown -> error? -> deny with parser reason -> exit 0
      +-- validate_plan       -> errors? -> deny with reasons      -> exit 0
      +-- resolve_target_dir
      +-- target dir already exists? -> deny "Plan dir <path> already exists" -> exit 0
      +-- stage in <plansRoot>/.planview-stage-<sessionId>/
      +-- materialize_at + (optional) write_plan_html
      +-- atomic rename staging -> target ; cleanup staging on any failure
      +-- open browser (only if cfg.auto_open_browser && !PLANVIEW_NO_OPEN) -> exit 0
```

There is no marker file, deny-loop, or `hook_behavior` knob — `ExitPlanMode` + `PreToolUse` shipped in Claude Code v2.1.85 (2026-03-26), four days after this project started; the original `/tmp/planview-{session_id}.json` ferry was forced by that timing and is now obsolete. The hook either has the markdown or it doesn't; if it doesn't, it stays out of the way.

### Deny payloads

When parsing or validation fails, the hook returns:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Plan validation failed: ..."
  }
}
```

The agent sees the deny with the specific reason and can fix the plan + retry ExitPlanMode. Validation-error denies, parse-error denies, and "target dir exists" denies all use specific messages so the agent has actionable context.

### Critical: Always Exit 0

PreToolUse hooks block the tool if they return a non-zero exit code. The hook must always return 0 — even on errors — to avoid permanently blocking ExitPlanMode.

## Design Decisions

| Decision | Rationale |
|---|---|
| Produce-only, no execution | The topology is a composable output. Users incorporate it into their existing workflows rather than being locked into a closed pipeline. |
| `context: fork` for planning | Planning context stays in the forked subagent. Main agent only sees the returned JSON. No context window pollution. |
| Skill + renderer split | LLM handles judgment (decomposition); renderer handles deterministic work (diagrams, HTML). Zero tokens spent on rendering. |
| Markdown as contract | Single boundary between skill and renderer. Skill emits `# Title` + `## Unit NN:` + bodies + optional ```` ```topology ```` fences; renderer parses, validates, materializes. Both sides validate independently. ExitPlanMode's `plan` arg + PreToolUse stdin carry the contract end-to-end with no temp file in between. |
| Subagents = per-phase graphs | Each graph represents a real dispatch round. The diagram structure matches the actual execution model. |
| Team = single graph | The team is one communication boundary. Phasing is shown through arrows, not separate graphs. Agents persist across phases. |
| Topology overview derived, not authored | Computed from JSON via topological sort. Always consistent with the graph — can't drift. |
| One-shot skill, caller-driven iteration | `AskUserQuestion` doesn't surface inside forks. Skill generates and returns; caller handles adjust loop. Each adjustment is a full regeneration — no state to preserve. |
| Single bundled Node entrypoint | esbuild produces a self-contained `dist/cli.js`; runtime deps (`commander`, `zod`, `eta`) are inlined. End users only need Node ≥ 20. |
| Mermaid via CDN | Simplest browser visualization for V1. Renderer internals are replaceable without changing the skill. |
| Arrows = dispatch, rectangle = communication | Arrows show data flow and execution order (same for both modes). Rectangles show communication boundaries. Separates execution order from communication scope. |
| Nested agents are regular nodes | Same shape regardless of nesting. Nesting shown by arrows, not containers. Keeps visual language simple: node = agent, arrow = flow, rectangle = communication. |
| Hook-driven enforcement via deny | Hooks can gate but can't invoke skills or call the LLM. The only way to trigger LLM work from a hook is to deny with an instruction. |
| Regenerate on adjust, don't patch | Full rebuild from scratch is simpler and less error-prone than surgical edits. |

### Post-v1: MCP Server

Deferred per [research/cli-vs-mcp.md](../research/cli-vs-mcp.md). The CLI binary (`echo JSON | planview`) is already the agent-agnostic interface — any agent that can shell out can use it. An MCP server wrapping the same binary is the natural next step for agents that prefer tool-calling over subprocess invocation, but adds no capability that the CLI doesn't already provide.

## Rendering Backend

Mermaid via CDN — the only evaluated option with native stadium/pill and double circle shapes matching planview's visual language. The renderer architecture is swappable — `ts/mermaid.ts` can be replaced with a `ts/graphviz.ts` without changing any other pipeline stage (validate, graph, describe, html shell). Graphviz WASM (778 KB, gold-standard layout) is the strongest alternative if Mermaid limitations become blocking. See [research/diagram-rendering.md](../research/diagram-rendering.md) for the full evaluation.

## Development Setup

### Building

```bash
npm install
npm run build      # generate assets + bundle ts/cli.ts -> dist/cli.js
npm test           # vitest run
npm run typecheck  # tsc --noEmit
```

The bundled `dist/cli.js` is committed; rebuild after editing anything in `ts/` or `static/`. Requires Node ≥ 20.

### Making the binary available (optional)

For standalone CLI use outside the plugin, symlink the bundled entrypoint into `~/.local/bin`:

```bash
ln -sf "$(pwd)/dist/cli.js" ~/.local/bin/planview
```

`dist/cli.js` carries a `#!/usr/bin/env node` shebang and is chmod 755, so the symlink is executable directly. Subsequent `npm run build` runs overwrite the file in place — the symlink picks up the new version automatically.

> **Prerequisite:** `~/.local/bin` must be on your `$PATH`. Most shells include it by default. If not, add `export PATH="$HOME/.local/bin:$PATH"` to your shell profile.

When the plugin is enabled in Claude Code, the hook calls the bundle directly via `node "$CLAUDE_PLUGIN_ROOT/dist/cli.js" hook`, so no symlink is needed for the plugin path.

## Platform Constraints

- **macOS first:** uses `open` for browser launch (code has `win32: "start"` and fallback `xdg-open` but untested). `today_yymmdd_local()` shells out to `date(1)`, which is GNU/BSD-compatible but not on Windows.
- **Node ≥ 20 required:** TypeScript source in `ts/`, bundled to `dist/cli.js` via esbuild (`commander`, `zod`, `eta` inlined). `npm run build` rebuilds the bundle, `npm test` runs vitest, `npm run typecheck` runs `tsc --noEmit`.
- **No LLM calls in renderer:** the renderer is deterministic I/O only.
- **Session-scoped staging dir:** the hook stages writes in `<plansRoot>/.planview-stage-<sessionId>/` and renames on success. Concurrent hook invocations from different sessions don't collide; identical session_ids would (extremely unlikely under Claude Code).
- **Project-scoped plan dirs:** `<project>/<plan_dir_root>/` (default `plan/`). `$CLAUDE_PROJECT_DIR` is the source of truth (PWD fallback with stderr warning when unset).
