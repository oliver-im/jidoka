# 260616-0-excise-the-topology-and-html-rendering-subsystem — Excise the topology and HTML rendering subsystem
## Goal

Excise the topology and HTML rendering subsystem.
## Context

jidoka does two things that are drifting apart (see `docs/positioning.md`): (1) split plan-mode output into reviewable units — the durable core — and (2) *view* the plan via topology/Mermaid/HTML. The view is moving into a separate `claude-workflows-viz` tool that statically analyzes workflow `.js` files, **not** jidoka's topology JSON — so once the view leaves, the topology data model has no downstream consumer. This plan is the full excision: rip out the topology data model, the Mermaid renderer, and the HTML/browser output, leaving jidoka as plan-markdown → reviewable markdown units on disk + the review-pipeline config + the lifecycle convention.

## Decisions (locked, v1)

- **Full excision, including the topology data model** — not just the renderer. No downstream consumer remains (claude-workflows-viz reads `.js`, not topology JSON).
- **Call-graph-inward ordering** (view surface → data model → build → skill → docs). Forced, not stylistic: `html.ts`/`cli.ts` import the `Topology` type and the Mermaid renderer, so the type and `mermaid.ts` cannot be removed before the view surface that depends on them. "Data model first" would break the build.
- **Worktree mode** (`git_workflow: true`): worked in `worktrees/<plan-id>/` on `plan/<plan-id>`, one branch per unit, squash-merged to the plan branch; `--no-ff` to `main` + archive at the end.
- **Deps stay:** `eta` (renders the `.md` templates, not just HTML), `zod`, `commander`, `strip-json-comments` (config JSONC). None are topology-only.
- **Shared-with-plan-validation symbols stay:** `validate.ts:isValidId`/`AGENT_ID_RE` (hook session-id), `empty_task_summary` (plan validation), `Color` + `detectUnitCycles` (unit cycles).

## Out of scope (v1)

- `claude-workflows-viz` itself (separate repo) — this plan only removes jidoka's view; it does not build the replacement.
- Frozen history: `docs/exec-plans/completed/**` and `docs/CONVENTION.md` (portable, rendering-agnostic) are not touched.
- Dated design-doc records (`strategic-review.md`, `cli-over-mcp.md`) stay as history; only the docs whose *entire subject* is the removed view (`mermaid-rendering.md`, `browser-debugging.md`) are superseded.

## Unit list

| # | Title | Blocked by | Reviews |
|---|---|---|---|
| 01 | Remove the HTML/browser output and topology CLI command | — | /code-review + codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.' |
| 02 | Excise the topology data model and Mermaid renderer | 01 | /code-review + codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.' |
| 03 | Retire the asset-generation build step | 02 | /code-review + codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.' |
| 04 | Update the jidoka skill contract | 03 | /code-review + codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.' |
| 05 | Prune topology from the docs and plugin manifests | 04 | /code-review + codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.' |
## Cross-cutting constraints

- **Green at every unit boundary:** `npm run build && npm test && npm run typecheck` must pass at the close of each code-touching unit (`pretest` runs `npm run build`, so a dangling import fails the whole suite — delete a module and drop its last importer in the same unit).
- **Commit the rebuilt bundle:** `dist/cli.js` is committed and is what the ExitPlanMode hook executes; each code unit (01–03) rebuilds and commits it so the bundle never lags source.
- **Hook always exits 0** (`hook.ts:runHook`) — a non-zero hook would block ExitPlanMode permanently.
- **Reference, don't paste:** unit bodies point at code by `path:symbol`.

## References

- `docs/positioning.md` — the why (the two-things-drifting-apart argument; the claude-workflows-viz split).
- `docs/exec-plans/AGENTS.md` — resume protocol + worktree/branch git workflow.
- Pre-execution review (this session): 1 HIGH (plugin manifests advertised the removed subsystem) + 4 MED gaps, all folded into Units 04–05 and these constraints before Unit 01.
