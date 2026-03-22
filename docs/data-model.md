# Data Model & Execution Modes

Shared reference for both [agents](agent-guide.md) and [developers](developer-guide.md). This is the contract between the skill (which produces topology JSON) and the renderer (which visualizes it).

## Data Model

```typescript
interface Agent {
  id: string;                              // unique, [a-zA-Z0-9_-]+ only
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

interface Topology {
  task_summary: string;                    // one-line task description
  execution_mode: "team" | "subagents";    // top-level orchestration mode
  agents: Agent[];                         // the agents in this topology
}
```

## Topology JSON Schema

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

### Field Semantics

| Field | Type | Description |
|---|---|---|
| `task_summary` | `string` | One-line description of the overall task |
| `execution_mode` | `"team" \| "subagents"` | How agents are orchestrated at the top level |
| `agents` | `Agent[]` | The agents in this topology |
| `id` | `string` | Unique identifier. `[a-zA-Z0-9_-]+` only (prevents HTML injection in Mermaid labels). |
| `role` | `string` | What this agent does |
| `model` | `"haiku" \| "sonnet" \| "opus"` | Model selection |
| `tools` | `string[]` | Tools available to this agent |
| `blocked_by` | `string[]` | Agent IDs that must complete before this one starts |
| `background` | `boolean` | Subagent mode only. `true` = fire-and-forget, `false` = wait for result |
| `output` | `"inline" \| { file: string }` | Where the agent writes its output. Default: `"inline"`. |
| `produces` | `string?` | Human description of what this agent outputs (appears in topology overview) |
| `execution_mode` | `string?` | Set when this agent dispatches its own sub-agents |
| `agents` | `Agent[]?` | Nested sub-agents (recursive structure) |

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

When both modes appear in a topology (e.g., top-level subagents with a nested team), the HTML page shows the derived combined mode: "Mode: subagents + team".

### Output Strategies

| Strategy | Behavior | Diagram shape |
|---|---|---|
| `"inline"` | Result returns to the caller's context window | Rectangle |
| `{ "file": "path" }` | Agent writes output to a file | Stadium/pill |

The `produces` field describes what an agent outputs in human terms. It appears in the topology overview text.

### Terminology

| Term | Meaning |
|---|---|
| Phase | A wave of work derived from `blocked_by` dependencies. In subagents mode, the main agent dispatches each phase explicitly. |
| Step | Numbered items in the topology overview. The dependency-derived order within a phase. Parallel agents share a step with letter suffixes (2a, 2b). |
