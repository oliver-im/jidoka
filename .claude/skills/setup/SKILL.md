---
name: planview:setup
description: Walk the user through first-run setup for the planview plugin and write ~/.claude/plugins/planview/config.json. Use when the user says "set up planview", "configure planview from scratch", or runs the slash command for the first time.
allowed-tools: Read, Write, Bash, AskUserQuestion
---

# planview:setup

Interactive first-run configuration for the planview plugin. Runs **outside** the planning fork — `AskUserQuestion` works here, unlike inside `/planview`.

## When to use

- User explicitly asks to "set up planview".
- User runs the slash command for the first time (no `~/.claude/plugins/planview/config.json` exists yet).
- The `planview:configure` skill detected a missing config and redirected here.

## What you write

A JSON file at `~/.claude/plugins/planview/config.json` with the following keys:

| Key | Type | Default | Question to ask |
|---|---|---|---|
| `plan_dir_root` | string | `plan` | "Where should planview write plan dirs? (project-relative; defaults to `plan/`. Common alternatives: `plans/`, `notes/plan/`, `docs/plans/`.)" |
| `auto_open_browser` | bool | `false` | "Auto-open overview.html in the browser after a successful materialize? (default off — most users view the markdown in their editor; set true if you want a browser pop)" |
| `html_output` | bool | `false` | "Render overview.html alongside the markdown files? (default off — set true if you want the rendered HTML view; otherwise just the .md files)" |
| `plan_level_topology` | bool | `false` | _(reserved for v2 — don't ask; always write `false`)_ |

## Process

1. Check whether `~/.claude/plugins/planview/config.json` already exists (Read or Bash with `test -f`). If it does, ask the user whether to overwrite it or run `planview:configure` instead.
2. Walk through each setting in order using `AskUserQuestion`. Show the default in the prompt; accept Enter-for-default. Validate input as you go (no empty `plan_dir_root`, etc.).
3. Show a preview of the resulting JSON (formatted, two-space indent). Ask `confirm / edit / abort`.
4. On `confirm`: `mkdir -p ~/.claude/plugins/planview && write the file`. Print the path.
5. On `edit`: jump back to the question whose answer the user wants to change.
6. On `abort`: write nothing.

## Hard rules

1. **NEVER** write outside `~/.claude/plugins/planview/`. Don't touch project-level `.planview.json` from this skill.
2. **NEVER** silently overwrite an existing config — ask first.
3. **ALWAYS** include all four keys in the written JSON, even at default — the layered loader handles missing fields, but explicit values make the file self-documenting and survive cleanly through `planview:configure` round-trips.
4. **NEVER** invoke the planview binary or run `/planview`. This skill only writes config; runtime effects are observed through normal use.
