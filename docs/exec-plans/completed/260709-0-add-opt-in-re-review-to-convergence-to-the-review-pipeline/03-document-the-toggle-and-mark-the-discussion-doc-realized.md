# Unit 03 — Document the toggle and mark the discussion doc realized
**Blocked by:** 02-render-the-convergence-note-in-the-plan-level-review-bloc**Agents involved:** main only
## Summary

Make the toggle and convergence behavior discoverable in the reference docs and the setup skill, and flip the discussion doc from "not yet built" to realized. Docs-only — no code, so the suite is unaffected.

**Docs**
- `docs/data-model.md` — under *Review commands* / *Review stages*, document
  `review_reconverge` (default on, global-config-only) and the convergence-loop
  semantics + the severity gate.
- `docs/developer-guide.md` — the renderer section: the new `renderReReviewNote`
  path and how the flag threads through `resolvePipelines` → `buildUnitMd` /
  `buildProgressMd`.
- `README.md` — config table + review notes: add `review_reconverge`.
- `skills/setup/SKILL.md` — defaults table and the annotated JSONC template
  (new key, default `true`, global-only, one-line intent).

**Discussion doc**
- `docs/discussions/review-pipeline.md` — in §*Re-review to convergence*, change
  the closing `**Status:**` line from "not yet built — spawn a backlog item to
  ship it" to "Realized by plan `<this-plan-id>`." The H1 stance already covers
  the behavior, so no catalog change.

**Acceptance:** docs internally consistent; the setup skill's JSONC still
round-trips (now including `review_reconverge`); no test changes needed.

## Review pipeline

- [ ] `/code-review`
- [ ] `codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.'` — **exec**: the resuming agent runs this via the Bash tool, then surfaces the findings

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
---
See `progress.md` for the cursor and overall plan state.
