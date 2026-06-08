---
name: planview:setup
description: Interactive first-run setup for the planview plugin. Writes ~/.claude/plugins/planview/config.json.
allowed-tools: Read, Write, Bash, AskUserQuestion
disable-model-invocation: true
---

# planview:setup

Interactive first-run configuration for the planview plugin. Runs **outside** the planning fork — `AskUserQuestion` works here, unlike inside `/planview`.

## What you write

A JSONC file (JSON with `//` comments — the reader strips them before parsing) at `~/.claude/plugins/planview/config.json`. Every run writes all eight top-level keys plus the inline comments below, so a user opening the file later can read what each key does without checking the README.

| Key | Type | Default | Question to ask |
|---|---|---|---|
| `plan_dir_root` | string | `docs/exec-plans/active` | "Where should planview write plan dirs? (project-relative; defaults to `docs/exec-plans/active/` — the lifecycle convention's active slot. Simpler conventionless alternative: `plan/`.)" |
| `auto_open_browser` | bool | `false` | "Auto-open overview.html in the browser after a successful materialize? (default off — most users view the markdown in their editor; set true if you want a browser pop)" |
| `html_output` | bool | `false` | "Render overview.html alongside the markdown files? (default off — set true if you want the rendered HTML view; otherwise just the .md files)" |
| `plan_level_topology` | bool | `false` | _(reserved for v2 — don't ask; always write `false`)_ |
| `git_workflow` | bool | `false` | _(don't ask; write `false`. Set `true` by hand to opt into the worktree-per-plan / branch-per-unit workflow — planview then renders a `## Git workflow` reminder into each `progress.md`. Also settable per-repo in a committed `.planview.json`.)_ |
| `pre_review` | ReviewStep[] | `["/planview:pre-plan-review"]` | _(don't ask; write the shipped default)_ |
| `unit_review` | ReviewStep[] | `["/code-review"]` | _(don't ask; write the shipped default)_ |
| `plan_review` | ReviewStep[] | `[]` | _(don't ask; write the shipped default)_ |

### Review step forms

Each entry in `pre_review` / `unit_review` / `plan_review` is a **review step**, in one of two forms — so the pipeline isn't tied to slash commands or any single tool:

- a **slash command** string — e.g. `"/code-review"`, `"/planview:pre-plan-review"`. Whether the resuming agent runs it or hands it to you depends on that command's own `disable-model-invocation` (codex's review commands are operator-run).
- a **`{ run, mode }` bash template** — a tool-agnostic command. Worked examples:
  - codex: `{ "run": "git diff {diff_range} | codex exec \"{focus}\"", "mode": "print" }`
  - cursor-agent: `{ "run": "agent -p --mode ask \"{focus}\"", "mode": "exec" }`

  `run` may contain these **placeholders**, filled by the resuming agent at run time (the renderer records them verbatim — there's no diff at materialize time): `{plan_dir}` (the materialized plan dir — the only one meaningful in `pre_review`, which runs before any diff exists), `{base}` (the branch the plan forked from), `{diff_range}` (`merge-base(<base>,HEAD)..HEAD`), `{focus}` (a composed review focus; plan-level, filled by the `/planview:plan-review-prompt` composer). Exact per-stage applicability lives in the resume protocol (`docs/exec-plans/AGENTS.md`).

  `mode` is `"print"` (**default** — surface the ready-to-run command and stop for you to run it) or `"exec"` (opt-in — the resuming agent runs it via the Bash tool). The default is `print` on purpose: expensive/external review (codex) stays operator-run unless you deliberately opt a step into `exec`.

**Security — review steps are global-config-only.** The per-repo `.planview.json` override allow-list **excludes** the three review arrays, so cloning a repo can never make your agent run shell its committed config specifies — only this file, under your home dir, defines review steps. That boundary is what makes `exec` safe; keep review steps here.

### Template to write

Use this exact JSONC layout, substituting the three scalar answers from the questionnaire. The comments are part of the file — preserve them verbatim:

```jsonc
{
  // Where planview writes plan dirs (project-relative). Defaults to the
  // lifecycle convention's active slot; "plan" is the simpler conventionless
  // alternative.
  "plan_dir_root": "docs/exec-plans/active",

  // Open overview.html in the browser after a successful materialize.
  // Most users view the markdown in their editor; set true for a browser pop.
  "auto_open_browser": false,

  // Render overview.html alongside the .md files. Off by default;
  // set true if you want the rendered HTML view.
  "html_output": false,

  // Reserved for v2 — leave as false.
  "plan_level_topology": false,

  // Opt into the recommended execution workflow — each plan worked in its own
  // git worktree, one branch per unit (squash to the plan branch, --no-ff to
  // main). When true, planview renders a "## Git workflow" reminder into each
  // plan's progress.md. Shipped off; flip to true here, or per-repo in a
  // committed .planview.json, to opt a whole team in.
  "git_workflow": false,

  // Review steps to run BEFORE Unit 01, against the freshly materialized plan
  // dir. Rendered as "## Pre-execution review" in progress.md. The bundled
  // /planview:pre-plan-review is an adversarial reviewer of the plan as a plan
  // (no diff yet); it is agent-invocable, so the resuming agent auto-runs it on
  // the first session and stops before Unit 01 for you to read the findings.
  // Steps may also be { run, mode } templates — but with no diff yet, only
  // {plan_dir} is meaningful here (see "Review step forms" above). [] skips it.
  "pre_review": [
    "/planview:pre-plan-review"
  ],

  // Review steps to run AFTER each Unit lands, on the unit's local working-tree
  // diff (before commit). Rendered as a checklist in the Unit md.
  // Default "/code-review" is the BUILT-IN local-diff reviewer (correctness
  // bugs + reuse/simplification/efficiency cleanups). It is NOT the same as
  // "/code-review:code-review", which is the code-review *plugin* and reviews
  // a GitHub PR — wrong tool for a pre-commit unit gate.
  // No "--fix": unit review is plan-blind, so its findings are candidates to
  // triage against plan context, not auto-applied. "/code-review" takes no
  // focus argument; put any per-unit review focus in the unit body prose.
  // Add "/simplify" for a dedicated cleanup-only pass (it does NOT hunt bugs).
  // A step may instead be a { run, mode } template to use another tool, e.g.
  // { "run": "agent -p --mode ask \"{focus}\"", "mode": "exec" } (see "Review
  // step forms" above). Example: ["/code-review", "/simplify"]
  "unit_review": [
    "/code-review"
  ],

  // Review steps to run AFTER the last Unit's review and commit, against the
  // cumulative (committed) plan diff. Rendered as "## Plan-level review" in
  // progress.md — the net for cross-unit completeness the per-unit gate can't see.
  // Set this to your review VEHICLE; the resuming agent runs the bundled
  // "/planview:plan-review-prompt" composer, which reads the plan + cumulative
  // diff, aims a hostile cross-unit focus, and drives the vehicle. Tool-agnostic:
  //   - codex (template): { "run": "git diff {diff_range} | codex exec \"{focus}\"", "mode": "print" }
  //     planview injects its OWN review prompt; print stops for you, exec runs it.
  //   - codex (slash, legacy): "/codex:adversarial-review" — operator-run
  //     (disable-model-invocation), so the composer hands you the command.
  //   - any other tool: a { run, mode } template (see "Review step forms" above).
  // codex needs /codex:setup + `codex login` first. Leaving this [] but still
  // running the composer falls back to a default codex command.
  // Example: [{ "run": "git diff {diff_range} | codex exec \"{focus}\"", "mode": "print" }]
  "plan_review": []
}
```

These defaults give you a sensible review pipeline out of the box: `/planview:pre-plan-review` flags structural plan issues before any unit lands, the built-in `/code-review` reviews each unit's diff, and the plan-level slot is opt-in. Customizing is a hand-edit of `~/.claude/plugins/planview/config.json` after setup: add or remove slash commands **or `{ run, mode }` templates** in any of the three arrays (see "Review step forms" above). The README's "Editing review commands" section has more examples. The ExitPlanMode hook re-validates the file on every run, so save-and-go is safe.

## Process

1. Check whether `~/.claude/plugins/planview/config.json` already exists (Read or Bash with `test -f`). If it does, show its contents and ask the user whether to overwrite it or keep what's there. If they want surgical edits, point them at the file path and the README's "Editing review commands" section.
2. Walk through each user-facing setting in order using `AskUserQuestion`. Show the default in the prompt; accept Enter-for-default. Validate input as you go (no empty `plan_dir_root`, etc.). The auto-populated keys (`plan_level_topology`, `git_workflow`, `pre_review`, `unit_review`, `plan_review`) are not asked; they get written at their defaults.
3. Show a preview of the resulting JSONC (template above with the three scalar answers substituted in, comments preserved). Ask `confirm / edit / abort`.
4. On `confirm`: `mkdir -p ~/.claude/plugins/planview && write the file`. Print the path. Mention that customizing review commands is a direct edit of this file — the inline comments document the schema, and the README's "Editing review commands" section has additional examples.
5. On `edit`: jump back to the question whose answer the user wants to change.
6. On `abort`: write nothing.
