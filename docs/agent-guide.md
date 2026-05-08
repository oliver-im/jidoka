# Agent Guide: Producing Plan Markdown

> See [Data Model](data-model.md) for the underlying types (Plan + per-unit Topology) and field semantics.

## Overview

You produce **plan markdown**. The renderer (the ExitPlanMode hook, or `planview materialize` from the CLI) parses it, validates the result, and writes the materialized plan dir. Your job is to analyze the task, decompose it into reviewable units, and emit conforming markdown.

A unit may carry an optional **topology** when it dispatches multiple agents in a meaningful structure — embedded as a ` ```topology ` fenced JSON block inside the unit body. Most units don't need one.

## Skill Configuration

```
name: planview
context: fork
allowed-tools: Read, Grep, Glob, Bash
```

## Process

### Step 1: Analyze and produce a plan

Read the codebase using Read, Grep, Glob, then decompose the task into the markdown shape described in [Data Model — Plan markdown shape](data-model.md#plan-markdown-shape).

### Step 2: Return the markdown

Output the complete plan in a single ` ```markdown ` fence. The caller (main agent) decides what to do — typically reviews it, surfaces the summary to the user, then either accepts (calls `ExitPlanMode` with the markdown as the `plan` argument) or re-invokes `/planview` with adjustments.

You do **not** save the markdown anywhere. The hook reads it directly from PreToolUse stdin's `tool_input.plan` field when ExitPlanMode fires.

## Heuristics

### Unit splitting

Each unit must satisfy two constraints:

1. **Reviewable on its own.** A code-review or adversarial-review pass on the unit's diff should be meaningful without context from sibling units. If reviewing unit 03 requires understanding units 01–02 simultaneously, you've split incorrectly.
2. **Finishable in one session including reviews.** The work, the review, the fixes, and the commit all fit in one focused session. If a unit takes three sessions, split it.

No fixed line/time budget. Most plans land at **3–7 units**. Two-unit plans are rare (usually a single unit is enough). Ten-unit plans usually want to split into two plans with their own dirs.

Examples:

- Adding a new data type + validation + tests → one unit. The three pieces are coupled and reviewed together.
- Adding a new data type + materialization + HTML rendering + hook integration → four units. Each can be reviewed independently and lands a clean commit.
- Bumping a version + updating a README sentence → one unit ("housekeeping"). Don't split prose-only changes that share a theme.

### Topology decision

Default to no topology fence. Only attach one when a unit:

- **Dispatches more than one agent** with **meaningful structure** — parallel review by two distinct roles, a writer + a tester running concurrently, or a researcher whose output feeds an implementer.

Single-agent units (just "main does the work") **never carry a topology**. If you find yourself writing a one-agent topology, drop it — the unit is single-agent.

Examples:

- Unit "Implement X" with main + Sonnet writer + Opus reviewer running in parallel → topology fence with `execution_mode: "subagents"` and two agents.
- Unit "Refactor module Y" with just main doing the work → no topology fence.
- Unit "Research before implementing" with a researcher whose findings inform main → arguably a single-agent unit if the researcher just dumps to a file; arguably a 2-agent topology if the researcher genuinely runs in parallel and main waits on its output. When in doubt, prefer no topology.

### Slug

The parser derives the plan slug from the H1 task summary automatically (kebab-case, ≤ 60 chars, alphanumerics only). You don't write a slug field; pick a task summary that produces a sensible slug.

- Example: H1 = `Migrate the auth flow to PKCE` → slug = `migrate-the-auth-flow-to-pkce`.
- If the H1 has no alphanumerics, the parser rejects the plan; pick a different summary.

### Unit IDs and blocked_by

The parser auto-derives unit IDs (`NN-<slug-of-title>`) and sets each unit's `blocked_by` to the previous unit's ID by default — sequential. You don't need to write either.

If two units are genuinely independent tracks that converge later, call that out in the unit body so a reader knows. The materialized plan still serializes them sequentially in the dir listing; non-linear ordering at the plan-markdown level is **not** supported in v1.

### review_steps

The default review step is `/code-review:code-review`. The parser hard-codes this — you don't list it. If a unit needs a different review approach (e.g. an adversarial second-opinion pass for a foundational change), call it out in the body so the human reviewer takes the right action when the unit lands.

## Hard Rules

1. **NEVER** generate HTML. The renderer handles that.
2. **NEVER** call the renderer binary. Return markdown only; the hook (or `planview materialize`) handles rendering.
3. **NEVER** execute the plan. The skill is a planner only.
4. **NEVER** loop or ask for approval. One-shot generator.
5. On re-invocation with adjustments, regenerate the **FULL** markdown from scratch — no patching.
6. **NEVER** save the markdown to disk yourself. Return it to the caller; ExitPlanMode delivers it to the hook via `tool_input.plan`.

## Design Constraints

### Why one-shot

`AskUserQuestion` does not surface to the user inside a forked subagent — the fork runs to completion autonomously. The skill produces and returns. The caller (main agent) handles iteration using `AskUserQuestion` at the main-agent level, then re-invokes the skill with feedback baked into the prompt.

### Why fork works inside plan mode

Plan mode blocks Edit, Write, NotebookEdit, and Task tools. The Skill tool isn't restricted. When invoked, the forked subagent operates in its own context — outside plan-mode tool restrictions. It can run Bash and read the codebase to inform decomposition.

### Why the hook reads `tool_input.plan` directly

ExitPlanMode + PreToolUse hooks shipped in Claude Code v2.1.85 (2026-03-26). Before that, planview ferried the plan through `/tmp/planview-{session_id}.json` because the hook had no way to see what the user was about to approve. Now the markdown is right there in the PreToolUse payload — no temp file, no marker file, no deny-loop.

The standalone CLI (`echo '<topology-json>' | planview` or `planview <file>`) still accepts a bare Topology for direct rendering, untouched. Users wanting topology-only output don't go through the hook.

## Execution Mode Details

See [Data Model — Execution Modes](data-model.md#execution-modes) for full details on subagents vs team mode, arrow semantics, nested agents, and output strategies — those mechanics are unchanged, just applied per-unit instead of per-plan.
