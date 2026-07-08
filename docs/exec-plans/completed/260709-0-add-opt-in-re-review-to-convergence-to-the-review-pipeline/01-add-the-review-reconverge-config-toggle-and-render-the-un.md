# Unit 01 — Add the `review_reconverge` config toggle and render the unit-review convergence note
**Blocked by:** none**Agents involved:** main only
## Summary

Introduce the global-config boolean, wire it through the loader and the materializer, add the shared `renderReReviewNote` helper, and render the note into the per-unit `## Review pipeline` section. A complete vertical slice: the flag flows config → plan → rendered unit md, exercisable end-to-end on its own.

**Config (`ts/config.ts`)**
- Add `review_reconverge: boolean` to the `Config` interface and to
  `defaultConfig` (`true`).
- Add it to `configSchema` (`z.boolean().default(defaultConfig.review_reconverge)`).
- Add it to `mergeForWrite` so the `jidoka` setup path round-trips it.
- **Do not** add it to `PROJECT_OVERRIDE_KEYS` — keep it global-config-only, the
  same boundary the `*_review` arrays sit behind (a cloned repo's `.jidoka.json`
  must not silently change review behavior). It's inert prose so it's not a
  shell-exec risk, but keeping the review-config surface uniform is the point.

**Types (`ts/types.ts`)**
- Add `review_reconverge?: boolean` to `Plan` as a materializer-attached field
  (mirror the existing `git_workflow?` comment/pattern). Not on `planSchema`
  (never present on parsed input).

**Materializer (`ts/materialize.ts:resolvePipelines`)**
- Attach `plan.review_reconverge = config.review_reconverge;` alongside the
  existing `plan.git_workflow = config.git_workflow;`. Update the function's
  doc comment to mention the new attached flag.

**Renderer (`ts/render-md.ts`)**
- Add `renderReReviewNote(): string` — a fixed prose block (no per-plan data):
  after addressing findings, if the last pass reported ≥1 finding at or above
  the reviewer's middle "should-fix" tier (MEDIUM / Major / P1), re-run this
  review once on the post-fix diff and re-triage; below-the-bar examples
  (formatting, naming, comment/docstring wording, test-only style) vs at/above
  (behavior, a contract/interface, an invariant, error handling, a change that
  flips a test outcome); the no-severity fallback ("required a code change
  beyond formatting/naming/comments"); and the one-line caveat that severity
  gates *whether you re-run*, not which findings surface. Point at
  `docs/discussions/review-pipeline.md` for rationale rather than restating it.
- Thread the flag to the unit path: change `buildUnitMd(unit)` →
  `buildUnitMd(unit, reReview: boolean)`, append `renderReReviewNote()` to
  `reviewItems` **only when** `unit.review` has ≥1 step **and** `reReview` is
  true. Update the call site in `ts/materialize.ts:materializeAt` (the
  per-unit loop) to pass `plan.review_reconverge ?? false`.

**Tests**
- `ts/__tests__/config.test.ts` — default `review_reconverge` is `true`; a
  global override to `false` is respected; a `.jidoka.json` attempt to set it is
  ignored (allow-list). Mirror the existing `git_workflow`/default-tied cases.
- `ts/__tests__/render-md.test.ts` — `buildUnitMd` includes the convergence note
  when a review step is configured and the flag is on; omits it when the flag is
  off; omits it when the unit has no review steps.

**Acceptance:** `npm test` and `npm run typecheck` green; `npm run build`
regenerates `dist/cli.js` (committed).

**Note (expected forward-reference):** after this unit the *plan-level* review
block in `progress.md` still won't render the note — that lands in Unit 02. Name
this in review/commit so a plan-blind reviewer doesn't read it as a gap.

## Review pipeline

- [ ] `/code-review`
- [ ] `codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.'` — **exec**: the resuming agent runs this via the Bash tool, then surfaces the findings

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
---
See `progress.md` for the cursor and overall plan state.
