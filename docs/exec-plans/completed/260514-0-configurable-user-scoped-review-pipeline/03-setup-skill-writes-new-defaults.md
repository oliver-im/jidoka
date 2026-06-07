# Unit 03 — Setup skill writes new defaults
**Blocked by:** 02-materializer-resolution-and-renderer-integration**Agents involved:** main only**Topology:** none
## Summary

Extend the `planview:setup` skill so its first-run questionnaire writes the `tools` and `review_pipelines` keys with the shipped defaults. No new user-facing questions; defaults are written directly.

### Tasks

- `skills/setup/SKILL.md`:
  - Add `tools` and `review_pipelines` to the "What you write" section as auto-populated keys (not asked; documented as defaulted).
  - Append a short closing note in the body: "Customizing the review pipeline (adding codex, simplify, adversarial, fallbacks) happens through `planview:configure` after setup."
  - Update the "preview the resulting JSON" step to show that the rendered JSON now includes the new keys at their defaults.
- Confirm by reading the SKILL.md end-to-end that the existing hard rules still hold (never write outside `~/.claude/plugins/planview/`, never silently overwrite, all four — now six — top-level keys always present).

### Acceptance

- The updated SKILL.md documents writing the new keys at defaults without asking.
- The configure-after-setup hand-off is explicit.
- Existing hard rules remain intact.

### Notes

- Markdown-only edit. The skill is `disable-model-invocation: true` and instructions-driven.

## Review

- [ ] /code-review:code-review
---
See `progress.md` for the cursor and overall plan state.
