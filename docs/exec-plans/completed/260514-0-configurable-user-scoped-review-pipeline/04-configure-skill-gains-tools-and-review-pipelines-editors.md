# Unit 04 — Configure skill gains Tools and Review-pipelines editors
**Blocked by:** 03-setup-skill-writes-new-defaults**Agents involved:** main only**Topology:** none
## Summary

Extend the `jidoka:configure` skill with two new editable sections: Tools (add/edit/remove tool definitions) and Review pipelines (per-scope unit/plan step editor that picks tools from the Tools section).

### Tasks

- `skills/configure/SKILL.md`:
  - Add a **Tools** section to the settings table and walkthrough. List current tools with their `run`/`fallback` templates. Offer `Add tool` / `Edit tool` / `Remove tool` / `Keep`. New-tool questions: key name (must match `^[a-z][a-z0-9-]*$`), `run` template, optional `fallback` template.
  - Add a **Review pipelines** section. First question: pick scope (`unit` / `plan` / both / neither). For each chosen scope, offer `Add step` / `Edit step` / `Remove step` / `Keep`. "Add step" prompts pick a tool from the Tools section (or "define new tool" — jump to the Tools flow and return), then asks `op` only when the chosen tool's templates contain `{op}`, then optional `note`.
  - Restate the existing "never drop manually added keys" rule explicitly for both new sections (including foreign keys nested inside `tools[<name>]` and inside each step object).
  - Update the preview/confirm/abort flow so the rendered JSON preview includes the new sections.
  - Reference `docs/data-model.md` from the SKILL.md so users can read field semantics if they want depth.

### Acceptance

- SKILL.md documents both editor flows end-to-end with the same diff-style prompts the existing sections use.
- The "manually added keys preserved" invariant is restated for the new sections.
- No code changes — markdown-only.

### Notes

- Reuse the existing question flow conventions (current value as default, `confirm / edit / abort` at the end). Don't invent a new UX shape.

## Review

- [ ] /code-review:code-review
---
See `progress.md` for the cursor and overall plan state.
