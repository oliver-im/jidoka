---
name: planview:configure
description: Edit the existing planview config at ~/.claude/plugins/planview/config.json with diff-style prompts, preserving any manually added keys. Use when the user says "change planview settings" or "update my planview config".
allowed-tools: Read, Write, Bash, AskUserQuestion
disable-model-invocation: true
---

# planview:configure

Diff-style editor for an **existing** `~/.claude/plugins/planview/config.json`. Runs outside the planning fork — `AskUserQuestion` works here.

## When to use

- User asks to change a planview setting or "update my planview config".
- User wants to see their current planview configuration.

If no config exists, redirect to `planview:setup` instead of writing a fresh one — keeps the entry points clean.

## Process

1. Read `~/.claude/plugins/planview/config.json`. If it doesn't exist, tell the user and recommend `planview:setup`. Stop.
2. Parse the JSON. Note every key, including ones that aren't in the questionnaire (manual edits) — those must be preserved on write.
3. For each well-known scalar key (see "Settings to ask about" below), show the **current** value and ask whether to change it. Use the diff form: `current = X, change to?` with the current value as the default. Skip `plan_level_topology` for v1 (reserved).
4. Run the **Tools** editor (see below). Most users `Keep`; this section is hands-off unless they're adding or removing a tool definition.
5. Run the **Review pipelines** editor (see below). This is the more common edit — picking which tools fire after each Unit and at the Plan level.
6. After all answers, render a preview of the new JSON (with the manually added keys preserved alongside, and the Tools / Review pipelines sections fully expanded). Ask `confirm / edit / abort`.
7. On `confirm`: write the merged JSON back to the same path. Print the path.
8. On `edit`: jump back to whichever question or sub-flow the user wants to revisit.
9. On `abort`: write nothing.

## Settings to ask about

| Key | Current type | Allowed values |
|---|---|---|
| `plan_dir_root` | string | non-empty path, project-relative |
| `auto_open_browser` | bool | true / false |
| `html_output` | bool | true / false |

`plan_level_topology` stays as whatever was on disk (don't ask, don't drop). Legacy keys like `hook_behavior` and `max_deny_attempts` may still be present from earlier installs — leave them as-is on write; the runtime ignores them.

Any other top-level key the user manually added stays in place untouched.

## Tools editor

Tools live under `tools` as a map of `<name>` → `{ "run": "<slash-command-template>" }`. Every Tool is a Claude Code plugin slash command (e.g. `/code-review:code-review`, `/codex:{op}`). There is no bash escape hatch and no fallback. The `run` template may include the `{op}` placeholder, which gets substituted from a pipeline step's `op` field at materialize time.

### Display

List the current tools. Example:

```
Current tools:
  anthropic-cr  →  /code-review:code-review
  codex         →  /codex:{op}
  simplify      →  /simplify
```

### Action prompt

Ask: `Add tool / Edit tool / Remove tool / Keep`. Loop until `Keep`.

- **Add tool**: ask `name` (must match `^[a-z][a-z0-9-]*$` — kebab-case, starts with a letter), then `run` template (non-empty slash command). Reject inputs that don't begin with `/`.
- **Edit tool**: pick a tool from the list. Ask `run` (default = current). Foreign sub-fields on the tool entry that aren't `run` are NOT shown but ARE preserved on write — same invariant as the rest of the configure skill. The legacy `fallback` sub-field is purged on write.
- **Remove tool**: pick a tool, confirm. Warn if any review-pipeline step references it (the materialize step would later fail validation on unknown-tool).

Reference [`docs/data-model.md`](../../../docs/data-model.md) for the schema details if you need depth.

## Review pipelines editor

Two scopes live under `review_pipelines`:

- `unit` — runs after each Unit lands. Rendered into each Unit md.
- `plan` — runs after the last Unit's review and commit. Rendered into `progress.md` as `## Plan-level review`.

Each scope has a `steps: ReviewStep[]` array where every step is `{ "tool": "<name>", "op"?: "<op>", "note"?: "<note>" }`.

### Display

For each scope, list current steps in order. Example:

```
review_pipelines.unit:
  1. anthropic-cr
  2. codex / op=review
  3. simplify

review_pipelines.plan:
  (no steps configured)
```

### Action prompt

For each scope (unit, plan), ask: `Add step / Edit step / Remove step / Keep`. Loop until `Keep` for that scope, then move to the next.

- **Add step**: pick a Tool from the Tools section (offer `Define new tool` as a shortcut into the Tools editor; return to this flow when done). If the chosen Tool's `run` contains `{op}`, ask for the `op` value (non-empty). Else skip the op prompt. Then ask for an optional `note` (empty input → no note).
- **Edit step**: pick the step by position. Ask which fields to change (tool / op / note). The op prompt only appears if the (current or new) tool template contains `{op}`.
- **Remove step**: pick the step by position, confirm.

The materialize step substitutes `{op}` and validates references; the configure skill doesn't need to pre-substitute or check for unknown tools (the user will see the error on next materialize, which is the right time).

## Hard rules

1. **NEVER** drop manually added keys. Read the JSON as a generic value, modify only the answered fields, write the merged result. This applies to the top level AND to foreign sub-fields on each `tools[<name>]` entry. Step objects inside `review_pipelines.{unit,plan}.steps` are array elements without stable identity — foreign keys inside individual steps are NOT preserved (a known limitation worth flagging in the preview if you see them on the way in).
2. **NEVER** write outside `~/.claude/plugins/planview/`.
3. **NEVER** silently fail. If the file is unreadable or invalid JSON, surface the error and stop — `planview:setup` is the recovery path.
4. **NEVER** invoke the planview binary or run `/planview`.
