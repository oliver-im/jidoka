# Unit 05 — Docs sweep
**Blocked by:** 04-configure-skill-gains-tools-and-review-pipelines-editors**Agents involved:** main only**Topology:** none
## Summary

Bring the docs in line with the new model. Update glossary, drop the "parser hard-codes `/code-review:code-review`" claim, add the post-last-Unit plan-level review step to the resume protocol, and mention the new config in the README.

### Tasks

- `docs/data-model.md`:
  - Glossary additions: `Tool`, `ReviewStep`, `ReviewPipeline`, `Plan-level review`.
  - Update the `Unit` interface code block and the field-semantics table — remove `review_steps`, mention that review pipelines come from user config and are resolved at materialize time.
  - Add a "Review pipelines" subsection explaining the user-scoped config, the per-Unit and per-Plan scopes, `{op}` substitution, and the slash-vs-bash inference rule.
- `docs/agent-guide.md`:
  - Drop the "The parser hard-codes this" sentence under `review_steps`.
  - Replace with a brief note that review steps come from `~/.claude/plugins/planview/config.json` now and the skill produces no review info.
- `notes/plan/AGENTS.md`:
  - Add a bullet to the resume protocol: after the last Unit's review + commit, run the Plan-level pipeline from `progress.md`, surface findings to the user, then archive.
- `README.md`: short paragraph naming the new config keys (`tools`, `review_pipelines`) and pointing to `planview:configure`.

### Acceptance

- No remaining mention of "the parser hard-codes review steps" in any doc.
- Resume protocol explicitly handles the last-Unit transition.
- README explains how a user customizes their review pipeline (one-line pointer to the configure skill).

### Notes

- Pure prose. No tests, no code.

## Review

- [ ] /code-review:code-review
---
See `progress.md` for the cursor and overall plan state.
