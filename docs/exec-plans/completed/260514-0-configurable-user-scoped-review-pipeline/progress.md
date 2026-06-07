> **STATUS: completed · 2026-05 · realized-by the review-pipeline commit series (…→`def3edf`).** Shipped the configurable user-scoped review pipeline (config keys, resolution, setup/configure skills, docs). Its `tools` + `review_pipelines` config shape was **later flattened** to `unit_review`/`plan_review` (`3c87c99`) and modernized to the built-in `/code-review` + `plan-review-prompt` composer (`def3edf`) — so the unit bodies below describe a config structure the codebase no longer uses. Kept as the record of how user-scoped review first landed.

# 260514-0-configurable-user-scoped-review-pipeline — Progress

**Cursor:** all units implemented; awaiting review + commit.

## Done

- **01-config-schema-and-types** — added Tool/ReviewStep/ReviewPipeline/Resolved* types in `ts/types.ts`; extended Config + defaults + Zod schema + deep-merge `mergeForWrite` in `ts/config.ts`; +147 lines of config tests covering defaults, partial hydration, foreign-tool preservation, fallback removal, foreign scope keys, project-override rejection.
- **02-materializer-resolution-and-renderer-integration** — dropped hard-coded `review_steps` from `parse-markdown.ts:106` and from `Unit`/`unitSchema`; added `resolvePipelines()` + new `invalid_config` `MaterializeError` kind; threaded Config through `materialize`/`materializeAt`/hook/CLI; rewrote Review section in `render-md.ts` + `html.ts` + `unit.md.eta` + `plan.eta`; added `## Plan-level review` to `progress.md.eta`; updated 8 test files; net 311 tests passing.
- **03-setup-skill-writes-new-defaults** — `skills/setup/SKILL.md` documents writing the new `tools` and `review_pipelines` keys at shipped defaults with no new user-facing questions; configure-after-setup hand-off is explicit; "all six top-level keys" invariant restated.
- **04-configure-skill-gains-tools-and-review-pipelines-editors** — `skills/configure/SKILL.md` gained two new sub-flows (Tools editor with Add/Edit/Remove/Keep; per-scope unit/plan Review pipelines editor with conditional op prompts); "never drop manually added keys" invariant restated for nested tool sub-fields; step-array foreign-key limitation flagged.
- **05-docs-sweep** — `docs/data-model.md` gained a full Review-pipelines section with config + resolved shapes, substitution rule, slash/bash inference, validation rules, and glossary entries (Tool, ReviewStep, ReviewPipeline, Plan-level review); `docs/agent-guide.md` and `skills/planview/SKILL.md` drop the "parser hard-codes" claim; `notes/plan/AGENTS.md` resume protocol adds the last-Unit plan-level review + archive guidance; `README.md` documents the two new config keys + points to `planview:configure`.

## Blockers

_None._

## Notes

- When resuming, read this file first to find the cursor unit, then read the cursor unit's md. Skip `overview.md` unless this is the first session on the plan.
- Work one unit at a time. After finishing the cursor unit, run its review steps, then update this file: move the unit into Done with a one-liner and advance the cursor to the next unit id.
- Stop after each unit. Surface a brief summary to the user and wait for explicit go-ahead before starting the next unit. If the unit is blocked, record it under Blockers and stop without advancing the cursor.
