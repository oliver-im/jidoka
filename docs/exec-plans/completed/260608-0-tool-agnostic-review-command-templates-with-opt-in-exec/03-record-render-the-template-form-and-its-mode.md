# Unit 03 — Record + render the template form and its mode
**Blocked by:** 02-generalize-reviewcommandschema-schema-config**Agents involved:** main only**Topology:** none
## Summary

Carry the generalized `ReviewStep` through materialization and render the template + its `print`/`exec` mode into the plan dir prose, so a resuming agent knows whether to print or run each step. Renderer still only records — executes nothing.

Tasks:
- `ts/materialize.ts` (`resolvePipelines`): ensure the object form is carried onto the plan/units unchanged (type updates only).
- `ts/render-md.ts`: in the "## Pre-execution review", per-unit "## Review pipeline", and "## Plan-level review" sections, render slash commands as today and template objects as their `run` text plus an unambiguous mode badge — `print` ("surface this command, stop for the operator") vs `exec` ("agent runs this via Bash"). The rendered instruction must be unmistakable to a resuming agent.
- **Reframe the rendered `## Pre-execution review` section** (the surface a resuming agent reads in `progress.md`): with `pre-plan-review` now agent-invocable (Unit 05), it must state *who* runs the step and when — "agent auto-runs on first session, then stops before Unit 01" — not a passive operator checklist. This framing must agree with the `AGENTS.md` resume protocol (Unit 07).
- For `unit_review`/`pre_review` **template** steps, render the raw `run` template (placeholders intact) with a note that the **resuming agent** substitutes them per the resume protocol — the renderer does not substitute (no diff/base exists at materialize time).
- Tests (`ts/__tests__/{materialize,render-md}.test.ts`): object steps survive `resolvePipelines`; rendered md contains the template text + mode; slash-command rendering is unchanged.
- Build/typecheck/test green; dist rebuilt.

Acceptance: rendered plan dir shows template steps with explicit mode, slash-command steps render as before, the renderer executes nothing, tests + typecheck green.
Depends on Unit 02's `ReviewStep` type.

## Review pipeline

- [ ] `/code-review`
---
See `progress.md` for the cursor and overall plan state.
