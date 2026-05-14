---
name: planview:setup
description: Interactive first-run setup for the planview plugin. Writes ~/.claude/plugins/planview/config.json.
allowed-tools: Read, Write, Bash, AskUserQuestion
disable-model-invocation: true
---

# planview:setup

Interactive first-run configuration for the planview plugin. Runs **outside** the planning fork — `AskUserQuestion` works here, unlike inside `/planview`.

## What you write

A JSON file at `~/.claude/plugins/planview/config.json`. Every run writes all six top-level keys (even at default) so the file is self-documenting and easy to hand-edit afterward.

| Key | Type | Default | Question to ask |
|---|---|---|---|
| `plan_dir_root` | string | `plan` | "Where should planview write plan dirs? (project-relative; defaults to `plan/`. Common alternatives: `plans/`, `notes/plan/`, `docs/plans/`.)" |
| `auto_open_browser` | bool | `false` | "Auto-open overview.html in the browser after a successful materialize? (default off — most users view the markdown in their editor; set true if you want a browser pop)" |
| `html_output` | bool | `false` | "Render overview.html alongside the markdown files? (default off — set true if you want the rendered HTML view; otherwise just the .md files)" |
| `plan_level_topology` | bool | `false` | _(reserved for v2 — don't ask; always write `false`)_ |
| `tools` | object | see below | _(don't ask; write the shipped tool defaults)_ |
| `review_pipelines` | object | see below | _(don't ask; write the shipped pipeline defaults)_ |

### Default `tools` to write

```json
{
  "anthropic-cr": { "run": "/code-review:code-review" },
  "codex":        { "run": "/codex:{op}" },
  "simplify":     { "run": "/simplify" }
}
```

Every Tool is a Claude Code plugin slash command. There is no bash escape hatch and no fallback.

### Default `review_pipelines` to write

```json
{
  "unit": { "steps": [ { "tool": "anthropic-cr" } ] },
  "plan": { "steps": [] }
}
```

These defaults match planview's pre-config behavior — only `/code-review:code-review` runs after each Unit, and nothing runs at the Plan level. `codex` and `simplify` are pre-defined as Tools so the user only has to reference them by name in `review_pipelines` to enable them — no Tool definition needed. Customizing the review pipeline (adding codex, simplify, adversarial) is a hand-edit of `~/.claude/plugins/planview/config.json` after setup; see the README's "Editing tools and review pipelines" section. The ExitPlanMode hook re-validates the file on every run, so save-and-go is safe.

## Process

1. Check whether `~/.claude/plugins/planview/config.json` already exists (Read or Bash with `test -f`). If it does, show its contents and ask the user whether to overwrite it or keep what's there. If they want surgical edits, point them at the file path and the README's "Editing tools and review pipelines" section.
2. Walk through each user-facing setting in order using `AskUserQuestion`. Show the default in the prompt; accept Enter-for-default. Validate input as you go (no empty `plan_dir_root`, etc.). The auto-populated keys (`plan_level_topology`, `tools`, `review_pipelines`) are not asked; they get written at their defaults.
3. Show a preview of the resulting JSON (formatted, two-space indent), including the auto-populated `tools` and `review_pipelines` sections. Ask `confirm / edit / abort`.
4. On `confirm`: `mkdir -p ~/.claude/plugins/planview && write the file`. Print the path. Mention that customizing the review pipeline (adding codex/simplify steps, defining new tools, populating the plan-level pipeline) is a direct edit of this JSON — point at the README's "Editing tools and review pipelines" section for schema and examples.
5. On `edit`: jump back to the question whose answer the user wants to change.
6. On `abort`: write nothing.
