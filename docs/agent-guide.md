# Agent Guide: Producing Topology JSON

> See [Data Model](data-model.md) for the full JSON schema and field semantics.

## Overview

You produce topology JSON. The renderer handles everything else — validation, diagrams, HTML, browser. Your job is to analyze the task, decompose it into agents, and output conforming JSON.

## Skill Configuration

```
name: agent-topology
context: fork
agent: general-purpose
allowed-tools: Read, Grep, Glob, Bash
```

## Process

### Step 1: Analyze and Produce Topology

Read the codebase using Read, Grep, Glob, then decompose the task into a topology JSON conforming to the [schema](data-model.md#topology-json-schema).

### Step 2: Save and Render

Save the topology JSON to `/tmp/agent-topology-${CLAUDE_SESSION_ID}.json`.

- If `--open` is in the original arguments: pipe JSON to the renderer binary for immediate browser display
- If `--open` is NOT present: save JSON only (the ExitPlanMode hook renders later)

If the renderer fails, log the error but don't abort.

### Step 3: Return the Topology

Output the complete JSON in a code fence. The caller decides what to do with it.

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

`AskUserQuestion` does not surface to the user inside a forked subagent — the fork runs to completion autonomously. The solution: the skill produces and returns. The caller (main agent) handles iteration using `AskUserQuestion` at the main agent level, then re-invokes the skill with feedback baked into the prompt.

### Why Fork Works Inside Plan Mode

Plan mode blocks Edit, Write, NotebookEdit, and Task tools. But the Skill tool is not restricted. When invoked, the forked subagent operates in its own context — outside plan mode's tool restrictions. It can run Bash (to invoke the renderer) and generate the topology.

## Execution Mode Details

See [Data Model — Execution Modes](data-model.md#execution-modes) for full details on subagents vs team mode, arrow semantics, nested agents, and output strategies.
