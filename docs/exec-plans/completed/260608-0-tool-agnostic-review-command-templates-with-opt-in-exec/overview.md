# 260608-0-tool-agnostic-review-command-templates-with-opt-in-exec — Tool-agnostic review command templates with opt-in exec
## Goal

Tool-agnostic review command templates with opt-in exec.
## Context

_Why-now and the context that motivated this plan._

## Decisions (locked, v1)

Realizes the superseding decision block in `docs/design-docs/review-pipeline.md` (supersedes #6, refines #5):

1. **Generalize the schema** — a review step is a slash command (today) **or** a `{ run, mode }` bash template. Placeholders: `{plan_dir}`, `{base}`, `{diff_range}` (= `merge-base..HEAD`), `{focus}`. Object form over string-prefix tagging (a template can legitimately start with `/`).
2. **Jidoka owns its plan-level review prompt** — author it (not vendor codex's diff/code-shaped, drift-prone prompt). With `codex exec`, codex supplies the *model*, jidoka the *prompt*.
3. **Operator-vs-agent (print/exec) axis spans all three stages.** `print` (default) = surface the command, stop for the operator. `exec` (opt-in) = agent runs it via Bash (legitimate — only the SlashCommand route is blocked). Default is **not** flipped.
4. **`pre-plan-review` becomes agent-invocable + auto-run-then-stop** — drop its `disable-model-invocation`; first session auto-runs it, surfaces findings, stops before Unit 01 (surface, don't auto-revise). Cheap/read-only/findings-only ⇒ none of codex's operator-run reasons apply.

**Boundaries:** the renderer only *records* commands (the hook stays exit-0, never runs shell); review steps stay **global-config-only** (not project-overridable) so a cloned repo's `.jidoka.json` can't make the agent run arbitrary shell.

## Out of scope (v1)

_Items deferred or explicitly not addressed._

## Unit list

| # | Title | Blocked by | Reviews |
|---|---|---|---|
| 01 | Pin the design in review-pipeline.md | — | /code-review |
| 02 | Generalize reviewCommandSchema (schema + config) | 01 | /code-review |
| 03 | Record + render the template form and its mode | 02 | /code-review |
| 04 | Author jidoka's own plan-level review prompt | 03 | /code-review |
| 05 | Generalize review-step invocation (composer + pre-review flag) | 04 | /code-review |
| 06 | Config UX — setup questionnaire + annotated comments | 05 | /code-review |
| 07 | Docs — data-model, agent-guide, resume protocol, README | 06 | /code-review |
## Cross-cutting constraints

_Conventions, invariants, etc._

## References

_Linked docs and external context._
