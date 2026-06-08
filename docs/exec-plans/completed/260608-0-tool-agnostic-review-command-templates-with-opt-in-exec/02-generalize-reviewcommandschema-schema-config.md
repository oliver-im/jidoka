# Unit 02 — Generalize reviewCommandSchema (schema + config)
**Blocked by:** 01-pin-the-design-in-review-pipeline-md**Agents involved:** main only**Topology:** none
## Summary

Relax the schema gate so a review step is either a slash command or a `{ run, mode }` template object, and lock in the project-override security boundary with a test.

Tasks:
- `ts/types.ts`: replace `reviewCommandSchema` (`z.string().min(1).startsWith("/")`) with a union — (a) a string starting with `/` = slash command (unchanged); (b) an object `{ run: string (min 1), mode?: "print" | "exec" (default "print") }` = bash template. Export a `ReviewStep` type. Justify object-over-string-prefix in the unit body: a bash template can legitimately start with `/` (absolute paths), so prefix-tagging is ambiguous; an object is unambiguous and extensible.
- `ts/config.ts`: `Config` review arrays become `ReviewStep[]`; defaults unchanged in behavior (still the existing slash-command strings); refresh field comments to mention the template form. Confirm `applyProjectOverrides` / `PROJECT_OVERRIDE_KEYS` still excludes `pre_review`/`unit_review`/`plan_review`.
- **Capture the invocation model + placeholder scoping in the schema comments:** `mode` is template-only (slash-command steps carry no `mode`; their operator-vs-agent is the skill's `disable-model-invocation`); placeholders are stage-scoped (`pre_review` has no diff → only `{plan_dir}` valid there; `{base}`/`{diff_range}`/`{focus}` apply to `unit_review`/`plan_review`).
- Tests (`ts/__tests__/config.test.ts` + schema cases): accepts a slash string; accepts a template object; template defaults `mode: "print"`; rejects empty `run`, bad `mode`, and a non-`/` bare string; a project `.planview.json` setting any review array is ignored.
- `npm run build`, `npm run typecheck`, `npm test` all green; commit the rebuilt `dist/cli.js`.

Acceptance: both forms validate, malformed forms reject, existing string defaults still validate unchanged, the project-override-rejection test passes, typecheck + tests green, dist rebuilt.
Note (forward-reference): the `ReviewStep` object is consumed by the renderer (Unit 03) and composer (Unit 05), which don't exist yet — a "template form only used in tests" flag here is expected.

## Review pipeline

- [ ] `/code-review`
---
See `progress.md` for the cursor and overall plan state.
