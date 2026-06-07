# Unit 01 — Config schema and types
**Blocked by:** none**Agents involved:** main only**Topology:** none
## Summary

Add the new Tool / ReviewStep / ReviewPipeline shapes to `ts/config.ts` and `ts/types.ts` without changing observable behavior. Existing Unit/Plan output stays byte-identical after this unit lands; nothing downstream consumes the new shapes yet.

### Tasks

- `ts/types.ts`: add `Tool`, `ReviewStep`, `ReviewPipeline`, `ReviewPipelines` interfaces and Zod schemas. Add `ResolvedReviewStep` (`primary: string`, `fallback?: string`, `note?: string`) and `ResolvedReviewPipeline` types for the materialize/render-time shape consumed downstream in Unit 02.
- `ts/config.ts`:
  - Extend `Config` with `tools: Record<string, Tool>` and `review_pipelines: ReviewPipelines`.
  - Extend `defaultConfig` with the shipped defaults — `anthropic-cr` (`/code-review:code-review`), `codex` (`/codex:{op}` + `codex agent {op}` fallback), `simplify` (`/simplify`); `review_pipelines.unit.steps = [{ tool: "anthropic-cr" }]`; `review_pipelines.plan.steps = []`.
  - Extend `configSchema` with the new Zod shapes. Each new key uses `.default(...)` so existing user configs that lack the keys hydrate cleanly without errors.
  - Extend `mergeForWrite` to round-trip the new keys while preserving manually added entries inside `tools` and `review_pipelines` sub-objects (same "never drop manual keys" invariant the configure skill relies on).
- `PROJECT_OVERRIDE_KEYS` stays unchanged — the new keys are user-scope only.
- `ts/__tests__/config.test.ts`: cover the new defaults, schema parsing of partial configs (missing keys hydrate to defaults), `mergeForWrite` preserving foreign keys nested under `tools[<name>]` and `review_pipelines.{unit,plan}.steps[i]`.

### Acceptance

- `npm run typecheck` clean.
- `npm run build` produces `dist/cli.js` with no behavior change.
- `npm test` green; new config tests cover defaults, partial-config hydration, and merge round-trip preserving foreign keys.
- No changes to `Unit`, `parse-markdown.ts`, `materialize.ts`, `render-md.ts`, `html.ts`, or any template. Existing materialized output is byte-identical.

### Notes

- No new dependencies — Zod handles all validation.
- Validation errors on tool *references* (unknown tool key, missing `op`, extra `op`) belong to Unit 02 at materialize time. This unit only validates schema shape — that `tools[name].run` is a non-empty string, etc.

## Review

- [ ] /code-review:code-review
---
See `progress.md` for the cursor and overall plan state.
