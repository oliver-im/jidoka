---
name: planview:configure
description: Edit the existing planview config at ~/.claude/plugins/planview/config.json with diff-style prompts, preserving any manually added keys. Use when the user says "change planview settings" or "update my planview config".
allowed-tools: Read, Write, Bash, AskUserQuestion
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
3. For each well-known key, show the **current** value and ask whether to change it. Use the diff form: `current = X, change to?` with the current value as the default. Skip `plan_level_topology` for v1 (reserved).
4. After all answers, render a preview of the new JSON (with the manually added keys preserved alongside). Ask `confirm / edit / abort`.
5. On `confirm`: write the merged JSON back to the same path. Print the path.
6. On `edit`: jump back to whichever question the user wants to revisit.
7. On `abort`: write nothing.

## Settings to ask about

| Key | Current type | Allowed values |
|---|---|---|
| `plan_dir_root` | string | non-empty path, project-relative |
| `auto_open_browser` | bool | true / false |
| `html_output` | bool | true / false |

`plan_level_topology` stays as whatever was on disk (don't ask, don't drop). Legacy keys like `hook_behavior` and `max_deny_attempts` may still be present from earlier installs — leave them as-is on write; the runtime ignores them.

Any other top-level key the user manually added stays in place untouched.

## Hard rules

1. **NEVER** drop manually added keys. Read the JSON as a generic value, modify only the answered fields, write the merged result.
2. **NEVER** write outside `~/.claude/plugins/planview/`.
3. **NEVER** silently fail. If the file is unreadable or invalid JSON, surface the error and stop — `planview:setup` is the recovery path.
4. **NEVER** invoke the planview binary or run `/planview`.
