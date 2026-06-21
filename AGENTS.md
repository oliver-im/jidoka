# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

jidoka is a Claude Code plugin that materializes plan-mode output as a directory of reviewable markdown units. It has two components:

- **Skill** (inline) — LLM analyzes a task, decomposes it into units, emits plan markdown (`# Title` H1 + `## Unit NN:` headings + per-unit summary + body), **writes it to the plan-mode plan file**, and calls ExitPlanMode. It has no `context: fork`, so it runs in the planning agent's own context.
- **Renderer** (TypeScript bundled to `dist/cli.js` via esbuild) — deterministic CLI. Reads plan markdown from PreToolUse stdin's `tool_input.plan` (hook mode) or from a file/stdin (`materialize` mode), validates, and writes the plan dir. Never calls the LLM.

The contract between them: the skill writes the plan markdown to the plan-mode plan file; on ExitPlanMode the harness reads that file and hands the hook its content as `tool_input.plan` (plus `planFilePath`); the hook materializes `<plan_dir_root>/<YYMMDD-N-slug>/` on disk and exits 0. (Verified against Claude Code 2.1.173 — the harness injects the file's content into the hook payload even when the model passes only `allowedPrompts`.)

## Repository State

`npm run build` produces `dist/cli.js` (bundled, committed); `npm test` runs the suite via vitest. The ExitPlanMode hook is declared in `hooks/hooks.json` (the plugin-native hook location) and invokes `node "$CLAUDE_PLUGIN_ROOT/dist/cli.js" hook`. Active plans live in worktrees under `docs/exec-plans/active/`; see `docs/exec-plans/AGENTS.md` (resume protocol + git workflow) and `docs/CONVENTION.md` (the portable lifecycle). Reference docs:

- `docs/CONVENTION.md` — the portable plan-lifecycle convention (three kinds, status-as-location, the two rules); standalone and jidoka-independent — adopt it in any repo
- `docs/data-model.md` — JSON schema, field semantics, review-step model (shared by both audiences)
- `docs/agent-guide.md` — skill config, heuristics, hard rules (for LLM agents)
- `docs/developer-guide.md` — architecture, validation rules, algorithms, CLI, hooks, design decisions (for developers building the renderer)

## Git workflow

`main` is protected — **never commit, push, or merge to `main` directly.** Land every change through a GitHub pull request: branch from `main`, push the branch, `gh pr create`, and let it merge on GitHub (CodeRabbit reviews PRs). This includes plan archival — `docs/exec-plans/AGENTS.md`'s end-of-plan step opens a PR for the plan branch rather than merging locally.

## Key Architecture Concepts

- **Hook integration:** PreToolUse hook on ExitPlanMode reads the plan markdown from `tool_input.plan` (which the harness populates from the plan-mode plan file the skill wrote; falls back to reading `tool_input.planFilePath` off disk) and materializes the plan dir before the user sees the approval dialog. Empty/missing plan on **both** channels → **loud deny** (so a broken wiring surfaces immediately, never a silent no-op); parse or validation failure → deny with reasoning.
- **One-shot skill:** the skill emits a complete plan in a single pass and deliberately doesn't ask clarifying questions — a design choice, not a platform limit. Iteration lives one level up: the agent gathers feedback in the normal plan-mode loop and re-invokes the skill, which regenerates the whole plan from scratch.
- **Review pipelines are config-driven:** the materializer resolves the user's `pre_review`/`unit_review`/`plan_review` steps from `~/.claude/plugins/jidoka/config.json` and renders them into each Unit md and `progress.md`; the renderer never runs them.

## When Implementing

- **Renderer must always exit 0** in hook mode — non-zero blocks ExitPlanMode permanently
- **Unit `blocked_by` validation** — references must resolve to sibling unit IDs in the same plan; self-deps and cycles are rejected
- **Runtime:** Node ≥ 20 (TypeScript source in `ts/`, bundled to `dist/cli.js` via esbuild; `commander` + `zod` + `eta` inlined). `npm run build` rebuilds the bundle, `npm test` runs vitest, `npm run typecheck` runs `tsc --noEmit`.
