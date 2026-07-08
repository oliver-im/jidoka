# Unit 02 — Render the convergence note in the plan-level review block
**Blocked by:** 01-add-the-review-reconverge-config-toggle-and-render-the-un**Agents involved:** main only
## Summary

Reuse the Unit 01 helper and flag at the second render site — the plan-level review section in `progress.md` — so a configured `plan_review` also gets the re-review instruction. Independent vertical increment (a distinct render path with its own test).

**Renderer (`ts/render-md.ts:renderPlanReviewBlock`)**
- `buildProgressMd` already receives the whole `plan`; read
  `plan.review_reconverge ?? false` and pass it into `renderPlanReviewBlock`.
- Append `renderReReviewNote()` to that block **only when** `steps` has ≥1 step
  **and** the flag is on. Deliberately **not** applied to
  `renderPreReviewBlock`: pre-execution review is "surface, don't auto-revise"
  (there is no code-fix diff to converge on), so the convergence loop doesn't
  fit that stage — note this exclusion in the block's doc comment.

**Tests**
- `ts/__tests__/render-md.test.ts` / `ts/__tests__/materialize.test.ts` —
  `buildProgressMd` plan-level block includes the note when `plan_review` has a
  step and the flag is on; omits it when off / no steps; the pre-execution block
  never includes it.

**Acceptance:** `npm test`, `npm run typecheck`, `npm run build` green; `dist`
regenerated.

## Review pipeline

- [ ] `/code-review`
- [ ] `codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.'` — **exec**: the resuming agent runs this via the Bash tool, then surfaces the findings

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
---
See `progress.md` for the cursor and overall plan state.
