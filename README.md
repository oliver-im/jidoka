# planview

A Claude Code plugin that materializes plan-mode output as a structured directory of markdown files (`docs/exec-plans/active/<YYMMDD-N-slug>/` with `overview.md`, `progress.md`, and per-unit `0N-*.md`). HTML rendering is opt-in via config. When a unit dispatches multiple agents, an optional per-unit topology is embedded as a Mermaid diagram.

### The Problem

Plan mode gives you approval before execution, but the plan lands in a random file under `~/.claude/plans/` and is reviewed in the terminal — fine for small tasks, painful for multi-step work that benefits from a directory of reviewable units. Separately, multi-agent topology is invisible: the main agent decides how to decompose a task into subagents or teams, but you never see that structure before it starts consuming tokens.

### What planview Does

1. **Plan-mode dir materialization (primary):** the ExitPlanMode hook reads the plan markdown straight out of `tool_input.plan` (PreToolUse stdin), parses it, validates it, and writes `overview.md` + `progress.md` + `0N-<unit-slug>.md` files into `<plan_dir_root>/<YYMMDD-N-slug>/` (default `docs/exec-plans/active/`). `overview.html` and the browser pop are opt-in via config.
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
| `plan_dir_root` | `docs/exec-plans/active` | ✓ (relative paths only) | Where plan dirs land, resolved against the project root. |
| `auto_open_browser` | `false` | ✓ | Open `overview.html` in the browser after materialize. |
| `html_output` | `false` | ✓ | Render `overview.html` alongside the markdown files. |
| `plan_level_topology` | `false` | — | Reserved for v2; currently always false. |
| `pre_review` | `["/planview:pre-plan-review"]` | — | Slash commands to run **before** Unit 01, against the freshly materialized plan dir. Rendered as `## Pre-execution review` in `progress.md`. Reviews the plan *as a plan* — no diff exists yet. |
| `unit_review` | `["/code-review"]` | — | Slash commands to run after each Unit lands, on the unit's local working-tree diff. The built-in **`/code-review`** (correctness bugs + reuse/simplification/efficiency cleanups) — **not** `/code-review:code-review`, which is the code-review *plugin* and reviews a GitHub PR. No `--fix` (findings are triaged against plan context, not auto-applied). Rendered as a checklist in the Unit md. |
| `plan_review` | `[]` | — | Slash commands to run after the last Unit's review and commit, against the cumulative committed diff. Opt-in; the recommended form is `/codex:adversarial-review --base <branch>` (see below). Rendered as `## Plan-level review` in `progress.md`. |

Defaults assume "files-on-disk is the value, the browser is opt-in" — most users view plan dirs in their editor (Obsidian, VS Code, iA Writer). Flip `auto_open_browser=true` and/or `html_output=true` if you want the rendered HTML view too.

### First-time setup

Tell Claude Code "**set up planview**" to invoke the `planview:setup` skill — a short Q&A that writes `~/.claude/plugins/planview/config.json` from scratch. It runs outside the planning fork (so `AskUserQuestion` works there).

### Editing review commands

After first-time setup, hand-edit `~/.claude/plugins/planview/config.json` directly — `pre_review`, `unit_review`, and `plan_review` are just lists of slash commands. Schema reference: [`docs/data-model.md`](docs/data-model.md#review-commands).

The three stages, in execution order on a fresh plan:

1. **Pre-execution** (`pre_review`) — runs after the plan dir materializes, before Unit 01 starts. Reviews the plan *as a plan* (no diff yet). Default `["/planview:pre-plan-review"]` — the bundled adversarial planning reviewer.
2. **Per-unit** (`unit_review`) — runs after each unit's diff lands, before committing. Default `["/code-review"]` — the built-in local-diff reviewer (bugs + cleanups). It's a *local correctness gate*: findings are candidates to triage against plan context (so no `--fix`, which would blindly "fix" intentional mid-plan forward-references). `/code-review` takes no focus argument — put per-unit review focus in the unit body prose. Add `/simplify` for a dedicated cleanup-only pass (it does **not** hunt bugs).
3. **Plan-level** (`plan_review`) — runs after the last unit is reviewed and committed, against the cumulative committed diff. The *completeness net* for cross-unit issues the per-unit gate can't see. Default `[]` (opt-in). Recommended: **`/planview:plan-review-prompt`** — a bundled skill the resuming agent runs that reads the plan + cumulative diff and **composes a focused, ready-to-run `/codex:adversarial-review --base <branch>` command** for you to execute. The composer earns its keep because the agent that just executed the plan has the sharpest context for aiming a hostile review (cross-unit seams, deferred forward-references that should now be wired up) — and codex review is **operator-run** (it sets `disable-model-invocation`, so the agent can't invoke it; it hands you the command). codex needs `/codex:setup` + `codex login` first. Manual alternatives if you skip the composer: `/codex:adversarial-review --base <branch>` directly, or `/code-review <branch>` (no codex).

The file is parsed as **JSONC** — `//` and `/* */` comments are stripped before parsing. The setup skill writes an annotated template by default, so the in-file comments are the primary "what does this key do" reference; the README is for examples and schema depth.

The ExitPlanMode hook re-validates the file on every run, so save-and-go is safe: a malformed config surfaces a deny payload the next time you exit plan mode, with the parse / schema error inline.

Example — keeping the pre-execution default, running the built-in `/code-review` plus a `/simplify` cleanup pass after each unit, and the `plan-review-prompt` composer at plan-close (which preps the hostile codex pass):

```jsonc
{
  "pre_review": [
    "/planview:pre-plan-review"
  ],
  "unit_review": [
    "/code-review",
    "/simplify"
  ],
  "plan_review": [
    "/planview:plan-review-prompt"
  ]
}
```

Each entry is a Claude Code slash command rendered verbatim into a Unit md checkbox (`unit_review`) or into `progress.md` (`pre_review` and `plan_review`). Two things to keep in mind:

- **Namespace trap:** the built-in `/code-review` reviews a **local diff**; `/code-review:code-review` is a *separate plugin* that reviews a **GitHub PR**. For pre-commit unit gates you want the built-in.
- **codex review is operator-run:** `/codex:review` and `/codex:adversarial-review` set `disable-model-invocation`, so a resuming agent can't invoke them. That's why the recommended `plan_review` is the `/planview:plan-review-prompt` composer (which the agent *can* run) — it hands you a ready codex command to run yourself. codex needs `/codex:setup` + `codex login` first. Don't also enable codex's own `--enable-review-gate` (Stop hook) if planview already drives plan-level review, or you double-gate.

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
