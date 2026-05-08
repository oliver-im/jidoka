# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

planview is a Claude Code plugin that materializes plan-mode output as a directory of reviewable markdown units, with optional per-unit Mermaid diagrams when a unit dispatches multiple agents. It has two components:

- **Skill** (forked subagent) — LLM analyzes a task, decomposes it into units, returns plan markdown (`# Title` H1 + `## Unit NN:` headings + per-unit summary + body + optional ` ```topology ` fence) to the caller.
- **Renderer** (TypeScript bundled to `dist/cli.js` via esbuild) — deterministic CLI. Reads plan markdown from PreToolUse stdin's `tool_input.plan` (hook mode) or from a file/stdin (`materialize` mode), validates, writes the plan dir, and optionally renders HTML. Never calls the LLM.

The contract between them: ExitPlanMode carries the plan markdown in `tool_input.plan`; the hook reads it, materializes `<plan_dir_root>/<YYMMDD-N-slug>/` on disk, and exits 0. The standalone `echo '<topology JSON>' | node dist/cli.js` path stays for one-off topology rendering outside plan-mode.

## Repository State

`npm run build` produces `dist/cli.js` (bundled, committed); `npm test` runs the suite via vitest. The ExitPlanMode hook is wired in `.claude/settings.json` to `node "$CLAUDE_PLUGIN_ROOT/dist/cli.js" hook`. Active plans live under `notes/plan/`; see `notes/AGENTS.md` (top-level layout) and `notes/plan/AGENTS.md` (per-plan resume protocol) for the plan convention. Reference docs:

- `docs/data-model.md` — JSON schema, field semantics, execution modes (shared by both audiences)
- `docs/agent-guide.md` — skill config, heuristics, hard rules (for LLM agents)
- `docs/developer-guide.md` — architecture, validation rules, algorithms, CLI, hooks, design decisions (for developers building the renderer)

## Key Architecture Concepts

- **Execution modes** (per-unit topology): `subagents` (default, hub-and-spoke, phased dispatch) vs `team` (agents self-coordinate via SendMessage).
- **Hook integration:** PreToolUse hook on ExitPlanMode reads `tool_input.plan` markdown directly from stdin and materializes the plan dir before the user sees the approval dialog. Empty/missing plan → silent exit 0; parse or validation failure → deny with reasoning.
- **Per-unit topology fence:** when a unit body contains a ` ```topology ` fenced block, the parser extracts the JSON, validates it, attaches it to the unit, and strips the fence so the renderer doesn't draw the graph twice.
- **One-shot skill:** AskUserQuestion doesn't surface inside forks. Skill generates and returns; caller handles iteration by re-invoking with feedback.
- **Topology is advisory:** shows intended plan, not enforced execution. Arrows = data flow/order, rectangles = communication boundaries.

## When Implementing

- **Renderer must always exit 0** in hook mode — non-zero blocks ExitPlanMode permanently
- **Validation is scope-aware** — `blocked_by` references checked per nesting level, not globally
- **Mermaid ID escaping** — hyphens in agent IDs → underscores (Mermaid limitation)
- **Agent IDs** must match `^[a-zA-Z0-9_-]+$` to prevent HTML injection in Mermaid labels
- **Runtime:** Node ≥ 20 (TypeScript source in `ts/`, bundled to `dist/cli.js` via esbuild; `commander` + `zod` + `eta` inlined). `npm run build` rebuilds the bundle, `npm test` runs vitest, `npm run typecheck` runs `tsc --noEmit`.
