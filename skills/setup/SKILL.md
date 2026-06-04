---
name: planview:setup
description: Interactive first-run setup for the planview plugin. Writes ~/.claude/plugins/planview/config.json.
allowed-tools: Read, Write, Bash, AskUserQuestion
disable-model-invocation: true
---

# planview:setup

Interactive first-run configuration for the planview plugin. Runs **outside** the planning fork — `AskUserQuestion` works here, unlike inside `/planview`.

## What you write

A JSONC file (JSON with `//` comments — the reader strips them before parsing) at `~/.claude/plugins/planview/config.json`. Every run writes all seven top-level keys plus the inline comments below, so a user opening the file later can read what each key does without checking the README.

| Key | Type | Default | Question to ask |
|---|---|---|---|
| `plan_dir_root` | string | `plan` | "Where should planview write plan dirs? (project-relative; defaults to `plan/`. Common alternatives: `plans/`, `notes/plan/`, `docs/plans/`.)" |
| `auto_open_browser` | bool | `false` | "Auto-open overview.html in the browser after a successful materialize? (default off — most users view the markdown in their editor; set true if you want a browser pop)" |
| `html_output` | bool | `false` | "Render overview.html alongside the markdown files? (default off — set true if you want the rendered HTML view; otherwise just the .md files)" |
| `plan_level_topology` | bool | `false` | _(reserved for v2 — don't ask; always write `false`)_ |
| `pre_review` | string[] | `["/planview:pre-plan-review"]` | _(don't ask; write the shipped default)_ |
| `unit_review` | string[] | `["/code-review"]` | _(don't ask; write the shipped default)_ |
| `plan_review` | string[] | `[]` | _(don't ask; write the shipped default)_ |

### Template to write

Use this exact JSONC layout, substituting the three scalar answers from the questionnaire. The comments are part of the file — preserve them verbatim:

```jsonc
{
  // Where planview writes plan dirs (project-relative).
  // Common alternatives: "plans", "notes/plan", "docs/plans".
  "plan_dir_root": "plan",

  // Open overview.html in the browser after a successful materialize.
  // Most users view the markdown in their editor; set true for a browser pop.
  "auto_open_browser": false,

  // Render overview.html alongside the .md files. Off by default;
  // set true if you want the rendered HTML view.
  "html_output": false,

  // Reserved for v2 — leave as false.
  "plan_level_topology": false,

  // Slash commands to run BEFORE Unit 01, against the freshly materialized
  // plan dir. Rendered as "## Pre-execution review" in progress.md.
  // The bundled /planview:pre-plan-review is an adversarial reviewer of
  // the plan as a plan (no diff yet). Set to [] to skip the pre-flight.
  "pre_review": [
    "/planview:pre-plan-review"
  ],

  // Slash commands to run AFTER each Unit lands, on the unit's local
  // working-tree diff (before commit). Rendered as a checklist in the Unit md.
  // Default "/code-review" is the BUILT-IN local-diff reviewer (correctness
  // bugs + reuse/simplification/efficiency cleanups). It is NOT the same as
  // "/code-review:code-review", which is the code-review *plugin* and reviews
  // a GitHub PR — wrong tool for a pre-commit unit gate.
  // No "--fix": unit review is plan-blind, so its findings are candidates to
  // triage against plan context, not auto-applied. "/code-review" takes no
  // focus argument; put any per-unit review focus in the unit body prose.
  // Add "/simplify" for a dedicated cleanup-only pass (it does NOT hunt bugs).
  // Example: ["/code-review", "/simplify"]
  "unit_review": [
    "/code-review"
  ],

  // Slash commands to run AFTER the last Unit's review and commit, against
  // the cumulative (committed) plan diff. Rendered as "## Plan-level review"
  // in progress.md. This is the net for cross-unit completeness that the
  // per-unit gate can't see.
  // Recommended: "/planview:plan-review-prompt" — a bundled skill the resuming
  // agent runs that reads the plan + cumulative diff and composes a ready-to-run
  // "/codex:adversarial-review --base <branch>" command for you to execute.
  // codex review is OPERATOR-RUN (it sets disable-model-invocation, so the agent
  // can't invoke it — the composer hands you the command); codex needs /codex:setup
  // + `codex login` first. Manual alternatives: "/codex:adversarial-review --base
  // <branch>" directly, or "/code-review <branch>" (no codex).
  // Example: ["/planview:plan-review-prompt"]
  "plan_review": []
}
```

These defaults give you a sensible review pipeline out of the box: `/planview:pre-plan-review` flags structural plan issues before any unit lands, the built-in `/code-review` reviews each unit's diff, and the plan-level slot is opt-in. Customizing is a hand-edit of `~/.claude/plugins/planview/config.json` after setup: add or remove slash commands in any of the three arrays. The README's "Editing review commands" section has more examples. The ExitPlanMode hook re-validates the file on every run, so save-and-go is safe.

## Process

1. Check whether `~/.claude/plugins/planview/config.json` already exists (Read or Bash with `test -f`). If it does, show its contents and ask the user whether to overwrite it or keep what's there. If they want surgical edits, point them at the file path and the README's "Editing review commands" section.
2. Walk through each user-facing setting in order using `AskUserQuestion`. Show the default in the prompt; accept Enter-for-default. Validate input as you go (no empty `plan_dir_root`, etc.). The auto-populated keys (`plan_level_topology`, `unit_review`, `plan_review`) are not asked; they get written at their defaults.
3. Show a preview of the resulting JSONC (template above with the three scalar answers substituted in, comments preserved). Ask `confirm / edit / abort`.
4. On `confirm`: `mkdir -p ~/.claude/plugins/planview && write the file`. Print the path. Mention that customizing review commands is a direct edit of this file — the inline comments document the schema, and the README's "Editing review commands" section has additional examples.
5. On `edit`: jump back to the question whose answer the user wants to change.
6. On `abort`: write nothing.
