---
name: planview
description: Visualize multi-agent task decomposition as Mermaid diagrams. Use when a task requires multiple agents and you need to plan the topology before execution begins. In plan mode, always run /planview before calling ExitPlanMode.
allowed-tools: Read, Grep, Glob, Bash
---

# planview

You produce topology JSON. The renderer handles everything else — validation, diagrams, HTML, browser. Your job is to analyze the task, decompose it into agents, and output conforming JSON.

## Process

### Step 1: Analyze and Produce Topology

Read the codebase using Read, Grep, Glob, then decompose the task into a topology JSON conforming to the schema below.

### Step 2: Save and Render

Save the topology JSON to `/tmp/planview-${CLAUDE_SESSION_ID}.json`.

- If `--open` is in the original arguments: pipe JSON to the renderer binary for immediate browser display
- If `--open` is NOT present: save JSON only (the ExitPlanMode hook renders later)

If the renderer fails, log the error but don't abort.

Append a `## Topology` section to the active plan file with the JSON path:
```
## Topology
`/tmp/planview-${CLAUDE_SESSION_ID}.json`
```

### Step 3: Return the Topology

Output the complete JSON in a code fence. The caller decides what to do with it.

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

### JSON Schema

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
| `id` | `string` | Unique identifier. `[a-zA-Z0-9_-]+` only. |
| `role` | `string` | What this agent does |
| `model` | `"haiku" \| "sonnet" \| "opus"` | Model selection |
| `tools` | `string[]` | Tools available to this agent |
| `blocked_by` | `string[]` | Agent IDs that must complete before this one starts |
| `background` | `boolean` | Subagent mode only. `true` = fire-and-forget |
| `output` | `"inline" \| { file: string }` | Where the agent writes output. Default: `"inline"`. |
| `produces` | `string?` | Human description of what this agent outputs (2-5 words) |
| `execution_mode` | `string?` | Set when this agent dispatches its own sub-agents |
| `agents` | `Agent[]?` | Nested sub-agents (recursive structure) |

## Execution Modes

### Subagents (default)

Main agent dispatches focused subtasks in rounds. Each round dispatches all unblocked agents in parallel, waits for completion, then dispatches the next batch. Each round is a phase. Agents don't communicate with each other — all data flows through the main agent (hub-and-spoke).

### Team

Main agent creates a team. Agents self-coordinate using SendMessage and shared task list. `blocked_by` is enforced through task dependencies. Agents persist across phases.

### Arrows

In both modes, `blocked_by` expresses intended execution order and data flow. In subagents mode, it's effectively enforced. In team mode, it shows planned data flow (agents can freely communicate via SendMessage).

### Nested Agents

Agents can dispatch their own sub-agents by including `execution_mode` and `agents` fields. If nested mode is `"team"`, children get a communication boundary rectangle.

### Output

| Strategy | Behavior | Diagram shape |
|---|---|---|
| `"inline"` | Result returns to caller's context window | Rectangle |
| `{ "file": "path" }` | Agent writes output to a file | Stadium/pill |

The `produces` field describes what an agent outputs in human terms.

## Heuristics

### Tool Assignment

- **Read-only agents** (researchers, auditors): `["Read", "Grep", "Glob"]`
- **Implementation agents** (coders): `["Read", "Edit", "Write", "Bash"]`
- **Test agents**: `["Read", "Write", "Bash"]`

### Execution Mode

- **`team`**: long-running coordinated work, agents need to communicate, share state
- **`subagents`** (default): focused subtasks with clear inputs/outputs, no inter-agent communication

### Background

- **`true`**: long-running independent work not blocking others (e.g., linter)
- **`false`** (default): on the critical path, dependents wait

### Output

- **`"inline"`** (default): small output, main agent needs to reason about it
- **`{ "file": "path" }`**: large output, saves context window

## Hard Rules

1. **NEVER** generate HTML. Always delegate to the renderer binary.
2. **NEVER** render or open browser unless `--open` is in the original arguments.
3. **NEVER** execute the topology. The skill is a planner only.
4. **NEVER** loop or ask for approval. One-shot generator.
5. On re-invocation with adjustments, regenerate the **FULL** topology from scratch (no patching).

## Design Constraints

### Why One-Shot

`AskUserQuestion` does not surface to the user inside a forked subagent — the fork runs to completion autonomously. The skill produces and returns. The caller (main agent) handles iteration using `AskUserQuestion` at the main agent level, then re-invokes the skill with feedback baked into the prompt.

### Why Fork Works Inside Plan Mode

Plan mode blocks Edit, Write, NotebookEdit, and Task tools. But the Skill tool is not restricted. When invoked, the forked subagent operates in its own context — outside plan mode's tool restrictions. It can run Bash (to invoke the renderer) and generate the topology.
