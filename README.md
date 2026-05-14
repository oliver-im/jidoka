# planview

A Claude Code plugin that materializes plan-mode output as a structured directory of markdown files (`plan/<YYMMDD-N-slug>/` with `overview.md`, `progress.md`, and per-unit `0N-*.md`). HTML rendering is opt-in via config. When a unit dispatches multiple agents, an optional per-unit topology is embedded as a Mermaid diagram.

### The Problem

Plan mode gives you approval before execution, but the plan lands in a random file under `~/.claude/plans/` and is reviewed in the terminal — fine for small tasks, painful for multi-step work that benefits from a directory of reviewable units. Separately, multi-agent topology is invisible: the main agent decides how to decompose a task into subagents or teams, but you never see that structure before it starts consuming tokens.

### What planview Does

1. **Plan-mode dir materialization (primary):** the ExitPlanMode hook reads the plan markdown straight out of `tool_input.plan` (PreToolUse stdin), parses it, validates it, and writes `overview.md` + `progress.md` + `0N-<unit-slug>.md` files into `<plan_dir_root>/<YYMMDD-N-slug>/` (default `plan/`). `overview.html` and the browser pop are opt-in via config.
2. **Per-unit topology (optional):** when a unit body contains a ` ```topology ` fenced JSON block, it's extracted, validated, and rendered as a Mermaid diagram inside the unit md (and HTML if enabled) — showing roles, models, tools, and dependencies.
3. **Silent on empty/missing plan:** if `tool_input.plan` is empty, the hook exits 0 without doing anything. Parse or validation failure surfaces a deny payload with the reason so the agent can fix it and retry.

## Installation

### Build

```bash
npm install
npm run build
```

The bundled CLI lands at `dist/cli.js` (committed). Requires Node ≥ 20.

### Use as a Claude Code plugin (recommended)

Enabling the plugin auto-loads the skills under `skills/` and the ExitPlanMode hook declared in `hooks/hooks.json`. The hook invokes the bundled CLI via `$CLAUDE_PLUGIN_ROOT/dist/cli.js` — no PATH setup needed.

### Standalone CLI (optional)

To run the topology renderer outside the plugin (e.g. `echo '<topology>' | planview` for one-off diagrams), symlink the bundled CLI:

```bash
ln -sf "$(pwd)/dist/cli.js" /usr/local/bin/planview
```

Verify:

```bash
planview --version
planview --example    # opens a showcase diagram in the browser
```

### Hook Setup

The plugin's `hooks/hooks.json` already wires the PreToolUse hook. To add the hook to a project that doesn't use the plugin, add this to that project's `.claude/settings.json` (replacing `$CLAUDE_PLUGIN_ROOT` with the actual path to a planview checkout):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT/dist/cli.js\" hook" }
        ]
      }
    ]
  }
}
```

### Environment Variables

| Variable | Effect |
|---|---|
| `PLANVIEW_NO_OPEN` | Don't open the browser (just write the HTML and print the path) |
| `CLAUDE_PROJECT_DIR` | Project root used to resolve `<project>/<plan_dir_root>/`. PWD fallback with a stderr warning when unset. |
| `TMPDIR` | Override default `/tmp` for the topology renderer's HTML output |

## Configuration

planview reads a layered config: built-in defaults < `~/.claude/plugins/planview/config.json` (global) < `<project>/.planview.json` (project).

| Key | Default | Project-overridable? | What it does |
|---|---|---|---|
| `plan_dir_root` | `plan` | ✓ (relative paths only) | Where plan dirs land, resolved against the project root. |
| `auto_open_browser` | `false` | ✓ | Open `overview.html` in the browser after materialize. |
| `html_output` | `false` | ✓ | Render `overview.html` alongside the markdown files. |
| `plan_level_topology` | `false` | — | Reserved for v2; currently always false. |
| `tools` | three defaults shipped (`anthropic-cr`, `codex`, `simplify`) | — | Named reviewer definitions referenced by `review_pipelines`. Each entry is `{ "run": "<slash-command-template>" }`; the template may use `{op}` for subcommand substitution. Tools are Claude Code plugin slash commands only — no bash escape hatch, no fallback. |
| `review_pipelines` | `unit` = `[{ "tool": "anthropic-cr" }]`, `plan` = `[]` | — | Two ordered pipelines of `{ tool, op?, note? }` steps. `unit` runs after each Unit (rendered into the Unit md). `plan` runs after the last Unit (rendered into `progress.md` as `## Plan-level review`). |

Defaults assume "files-on-disk is the value, the browser is opt-in" — most users view plan dirs in their editor (Obsidian, VS Code, iA Writer). Flip `auto_open_browser=true` and/or `html_output=true` if you want the rendered HTML view too.

To customize the review pipeline (e.g. add `/codex:review`, `/simplify`, or `/codex:adversarial-review` to the unit-level pipeline; populate the plan-level pipeline; define new tools), run `planview:configure` and walk the **Tools** and **Review pipelines** sections. See [`docs/data-model.md`](docs/data-model.md#review-pipelines) for the schema.

### Optional: shared daily counter

If `<plan_dir_root>` has siblings named `research/`, `backlog/`, or `done/plan/` at the same parent, planview shares the daily counter `N` across them so identifiers like `260505-2-foo` are unambiguous across note types. This is purely opportunistic — the scan runs unconditionally and is harmless when those siblings don't exist (the counter just resets per day per plan dir).

### Setup wizard

To set or change config interactively:

- Tell Claude Code "**set up planview**" — invokes the `planview:setup` skill, walks all knobs with Q&A, and writes the global config file.
- Tell Claude Code "**change planview settings**" — invokes the `planview:configure` skill, which diff-edits the existing config and preserves any manually added keys.

Both skills run outside the planning fork (so `AskUserQuestion` works there).

## Documentation

| Document | Audience | Contents |
|---|---|---|
| [Data Model](docs/data-model.md) | Both | JSON schema, field semantics, execution modes, terminology |
| [Agent Guide](docs/agent-guide.md) | LLM agents | Skill configuration, process steps, heuristics, hard rules |
| [Developer Guide](docs/developer-guide.md) | Developers | Architecture, algorithms, validation, CLI, hooks, design decisions |

## Workflow

### Full Plan Mode Flow

1. User enters plan mode with a task
2. Claude explores the codebase, asks clarifying questions, drafts the plan
3. Claude invokes `/planview` from within plan mode
4. The forked subagent decomposes the work into units, optionally attaches a ` ```topology ` fenced block to any unit that dispatches multiple agents, returns the plan markdown to the caller
5. User reviews the proposed plan — if adjustments needed, tells the main agent
6. Main agent re-invokes `/planview` with adjustments (repeat until satisfied)
7. Main agent calls `ExitPlanMode` with the markdown as the `plan` argument → PreToolUse hook reads `tool_input.plan`, materializes `<plan_dir_root>/<YYMMDD-N-slug>/` (and renders/opens `overview.html` if those config knobs are on)
8. User reviews the rendered plan alongside the approval dialog in the CLI
9. User approves or rejects → execution begins from the materialized unit files

### Direct Topology Rendering (advanced)

The `/planview` slash command emits a plan markdown, not a bare topology. If you have a topology JSON in hand and want to render it on its own (for testing, exploration, or one-off diagrams), the standalone CLI still accepts topology input:

```
echo '<topology-json>' | planview
planview <topology.json>
planview --example          # built-in showcase
```

This path writes a single HTML to `$TMPDIR` and opens the browser. It does not materialize a plan dir and is unaffected by the hook.

### Materialize a plan markdown without ExitPlanMode

```
planview materialize <plan.md>            # parses markdown, writes plan dir
planview materialize - < plan.md          # same, via stdin
planview materialize <legacy-plan.json>   # legacy Plan JSON still accepted (auto-detected)
```
