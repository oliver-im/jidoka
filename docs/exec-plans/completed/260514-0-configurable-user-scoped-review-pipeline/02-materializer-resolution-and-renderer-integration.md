# Unit 02 — Materializer resolution and renderer integration
**Blocked by:** 01-config-schema-and-types**Agents involved:** main only**Topology:** none
## Summary

Atomic swap: drop the hard-coded `review_steps` from the parser, drop the field from `Unit`, resolve the configured pipelines at materialize time, rewrite the templates to consume the resolved structure, and add the Plan-level review section to `progress.md`. This is the largest unit; review it carefully.

### Tasks

- `ts/parse-markdown.ts:106`: drop the `review_steps: ["/code-review:code-review"]` line. The parser no longer emits review info.
- `ts/types.ts`:
  - Drop `review_steps: string[]` from the `Unit` interface and `unitSchema`.
  - Add `review_pipeline?: ResolvedReviewPipeline` to `Unit` (materializer fills it; parser leaves undefined; schema treats it as optional/internal).
  - Add `plan_review_pipeline?: ResolvedReviewPipeline` to `Plan`.
- `ts/materialize.ts`:
  - Add `resolvePipelines(plan, config)` that walks `config.review_pipelines.unit.steps` per Unit and `config.review_pipelines.plan.steps` once, looking up tools, substituting `{op}` (single placeholder, literal string replace), and producing `ResolvedReviewStep[]` for each Unit (`unit.review_pipeline = ...`) and the plan (`plan.plan_review_pipeline = ...`).
  - Validation: unknown tool reference, `op` missing when the tool's `run` or `fallback` template contains `{op}`, `op` provided when neither template contains it — each throws a `MaterializeError` with a message that names the pipeline scope, step index, and tool key.
  - `materializeAt` calls `resolvePipelines` immediately after schema validation, before writing files.
- `ts/render-md.ts`:
  - `buildUnitMd`: replace the `reviewItems` block. For each `ResolvedReviewStep`, emit a top-level checkbox with the resolved primary command; if `fallback` is set, indent a sub-bullet "Fallback: `<command>`" with the optional `note` in italics after it. When `unit.review_pipeline?.steps` is empty/undefined, emit a single "_No review steps configured._" placeholder line.
  - `buildProgressMd`: extend the eta context with `planReviewBlock` rendered from `plan.plan_review_pipeline`. When non-empty, render `## Plan-level review` with the same checkbox shape as Unit reviews. When empty, render a short `## Plan-level review\n\n_No plan-level reviews configured. After the last unit, surface a summary and ask the user before archiving._` so the section is always there to anchor the resume protocol.
  - `buildOverviewMd`: replace the `unit.review_steps.join(" + ")` column with the resolved-primary commands joined the same way (or `—` when empty). Keeps the overview table format intact.
- `ts/html.ts`: change `UnitCard.review_steps: string[]` to a resolved shape (`{ primary: string; fallback?: string; note?: string }[]`). Update `renderPlanHtml` mapping. Update `templates/plan.eta` Review block to iterate the resolved structure (primary as `<li>` + optional nested fallback bullet).
- `templates/unit.md.eta`: swap the `reviewItems` interpolation for the new structured block.
- `templates/progress.md.eta`: append a `<%= it.planReviewBlock %>` interpolation after Notes.
- `templates/plan.eta`: update the per-Unit Review block to iterate the resolved structure.
- `ts/__tests__/`:
  - Update fixtures (`valid_plan_*.json`, `invalid_plan_*.json`) — drop `review_steps`.
  - Update `parse-markdown.test.ts` to no longer assert `review_steps` shape.
  - Update `types.test.ts` to reflect the dropped field.
  - Update `render-md.test.ts` and `html.test.ts` for the new Review section output.
  - Update `materialize.test.ts` end-to-end: shipped-default config produces the same `/code-review:code-review` line as today; custom config with codex + simplify produces the expected primary + fallback structure; plan-level pipeline renders into `progress.md` correctly (both empty and populated).
  - Add coverage for the three new validation errors (unknown tool, missing `op`, extra `op`).

### Acceptance

- `npm test` green.
- `npm run build` produces a working `dist/cli.js`.
- Materializing a plan with the shipped default config produces a Unit md with exactly the `/code-review:code-review` checkbox (proves no regression).
- Materializing with a custom config that adds codex + simplify produces a checklist with `/codex:review` plus its `codex agent review` fallback sub-bullet, followed by `/simplify`.
- Materializing with `review_pipelines.plan.steps` populated produces a `## Plan-level review` section in `progress.md` listing the resolved commands; an empty plan pipeline still produces the section with the "no plan-level reviews configured" line.
- The three validation errors deny the ExitPlanMode hook with messages that name the offending pipeline scope, step index, and tool key.

### Notes

- Review focus areas: (1) `{op}` substitution correctness (single replace, no regex magic), (2) the atomic parse→materialize→render flow leaves no intermediate state where one layer references a dropped field, (3) error-message clarity for the new validation paths.
- Foundational change — consider running the adversarial review pass against this Unit in addition to the default code review.

## Review

- [ ] /code-review:code-review
---
See `progress.md` for the cursor and overall plan state.
