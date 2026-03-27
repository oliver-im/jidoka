# planview

A Claude Code plugin that enhances plan mode with multi-agent topology diagrams. When you're planning a complex task that needs multiple agents, this tool decomposes the task into agents with roles, models, tools, and dependencies, then renders a visual diagram in the browser for review before execution begins.

### The Problem

Multi-agent topology is invisible in Claude Code. The main agent decides how to decompose a task into subagents or teams — how many agents, what roles, what dependencies, what order — but you never see that structure before it starts running and consuming tokens. There's no pre-execution review for multi-agent flow.

Plan mode gives you approval before execution, but the plan is written to a random file in `~/.claude/plans/` and viewed in the terminal, which isn't ideal for long-form text review.

### What planview Does

1. Decomposes a task into a topology JSON (agents, roles, models, tools, dependencies)
2. Renders the topology as a Mermaid diagram with a human-readable overview
3. Hooks into ExitPlanMode to show a combined plan+diagram HTML page in the browser
4. If no topology exists when ExitPlanMode fires, auto-invokes by denying the tool call and instructing the agent to run `/planview` first

## Installation

### Build

```bash
cargo build --release
```

The binary is at `target/release/planview`.

### Add to PATH

```bash
# Option A: symlink
ln -sf "$(pwd)/target/release/planview" /usr/local/bin/planview

# Option B: copy
cp target/release/planview /usr/local/bin/planview
```

### Verify

```bash
planview --version
planview --example    # opens a showcase diagram in the browser
```

### Hook Setup

The repository includes `.claude/settings.json` with the PreToolUse hook already configured. If you clone this repo, the hook works automatically.

To add the hook to a different project, add this to that project's `.claude/settings.json`:

```json
{
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

### Environment Variables

| Variable | Effect |
|---|---|
| `PLANVIEW_NO_OPEN` | Don't open the browser (just write HTML and print path) |
| `PLANVIEW_NO_AUTO` | Don't auto-invoke (hook silently exits when no topology file exists) |
| `CLAUDE_PLANS_DIR` | Override default `~/.claude/plans` location |
| `CLAUDE_SESSION_ID` | Used by the skill to namespace temp files |
| `TMPDIR` | Override default `/tmp` for HTML output |

## Documentation

| Document | Audience | Contents |
|---|---|---|
| [Data Model](docs/data-model.md) | Both | JSON schema, field semantics, execution modes, terminology |
| [Agent Guide](docs/agent-guide.md) | LLM agents | Skill configuration, process steps, heuristics, hard rules |
| [Developer Guide](docs/developer-guide.md) | Developers | Architecture, algorithms, validation, CLI, hooks, design decisions |

## Workflow

### Full Plan Mode Flow

1. User enters plan mode with a task
2. Claude explores the codebase, asks clarifying questions, writes the plan
3. Plan crystallizes — Claude sees it needs multiple agents
4. Claude invokes `/planview` from within plan mode
5. The forked subagent generates the topology, saves JSON, returns it
6. User reviews the topology — if adjustments needed, tells the main agent
7. Main agent re-invokes `/planview` with adjustments (repeat until satisfied)
8. The topology is incorporated into the plan
9. Claude calls ExitPlanMode → PreToolUse hook fires, renders combined plan+diagram
10. User reviews the combined page alongside the approval dialog in the CLI
11. User approves or rejects → execution begins with the full picture

### Standalone Flow

```
/planview --open <task description>
```

Generates topology and immediately opens the browser diagram.
