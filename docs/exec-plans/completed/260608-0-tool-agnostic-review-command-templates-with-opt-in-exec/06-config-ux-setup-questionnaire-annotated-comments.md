# Unit 06 — Config UX — setup questionnaire + annotated comments
**Blocked by:** 05-generalize-the-plan-review-prompt-composer**Agents involved:** main only**Topology:** none
## Summary

Teach `skills/setup/SKILL.md` and the JSONC config comments about the template/exec form, and make the config round-trip preserve object-form steps.

Tasks:
- `skills/setup/SKILL.md`: questionnaire + JSONC template comments document that a review step may be a slash command **or** a `{ run, mode }` template, with worked examples (`codex exec …`, `agent -p --mode ask …`), the placeholder list (`{plan_dir}`/`{base}`/`{diff_range}`/`{focus}`), `print`-default / `exec`-opt-in, and the security note that review steps are global-config-only (not project-overridable).
- Verify the setup round-trip (`config.ts` `loadGlobalRaw` / `mergeForWrite`) preserves object-form review steps written by hand; add a test if a gap exists.

Acceptance: setup writes/preserves object-form review steps; comments explain template/mode/placeholders + the global-only security note; the round-trip preserves manually-added template steps.
Depends on Unit 02.

## Review pipeline

- [ ] `/code-review`
---
See `progress.md` for the cursor and overall plan state.
