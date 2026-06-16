# Agent Guide: Producing Plan Markdown

> See [Data Model](data-model.md) for the underlying types (Plan and Unit) and field semantics.

## Overview

You produce **plan markdown**. The renderer (the ExitPlanMode hook, or `jidoka materialize` from the CLI) parses it, validates the result, and writes the materialized plan dir. Your job is to analyze the task, decompose it into reviewable units, and emit conforming markdown.

## Skill Configuration

```
name: jidoka
context: fork
allowed-tools: Read, Grep, Glob, Bash
```

## Process

### Step 1: Analyze and produce a plan

Read the codebase using Read, Grep, Glob, then decompose the task into the markdown shape described in [Data Model — Plan markdown shape](data-model.md#plan-markdown-shape).

### Step 2: Return the markdown

Output the complete plan in a single ` ```markdown ` fence. The caller (main agent) decides what to do — typically reviews it, surfaces the summary to the user, then either accepts (calls `ExitPlanMode` with the markdown as the `plan` argument) or re-invokes `/jidoka` with adjustments.

You do **not** save the markdown anywhere. The hook reads it directly from PreToolUse stdin's `tool_input.plan` field when ExitPlanMode fires.

## Heuristics

### Unit splitting

Each unit must satisfy these constraints:

1. **Reviewable on its own.** A code-review or adversarial-review pass on the unit's diff should be meaningful without context from sibling units. If reviewing unit 03 requires understanding units 01–02 simultaneously, you've split incorrectly.
2. **Independently testable.** Prefer a vertical slice you can exercise (build / test / run) on its own over a horizontal layer that only makes sense once a later unit wires it up. Testability is the sharp version of "reviewable on its own": if the slice can be tested, the per-unit review gate has something coherent to judge.
3. **Finishable in one session including reviews.** The work, the review, the fixes, and the commit all fit in one focused session. If a unit takes three sessions, split it.

No fixed line/time budget. Most plans land at **3–7 units**. Two-unit plans are rare (usually a single unit is enough). Ten-unit plans usually want to split into two plans with their own dirs.

Examples:

- Adding a new data type + validation + tests → one unit. The three pieces are coupled and reviewed together.
- Adding a new data type + validation + materialization + hook integration → four units. Each can be reviewed independently and lands a clean commit.
- Bumping a version + updating a README sentence → one unit ("housekeeping"). Don't split prose-only changes that share a theme.

**Mid-plan incompleteness.** The per-unit review gate (`/code-review`) sees only the unit's diff with no plan context, so it flags intentional forward-references — a helper unit 01 adds but unit 03 calls reads as "unused"; a half-handled enum reads as "non-exhaustive." Splitting into testable slices keeps this rare. When a unit genuinely must leave a forward-reference, name it in the body (e.g. "`parsePlan()` is unused until Unit 03 wires it into the hook — unused-symbol findings here are expected") so the reviewer discounts the expected finding instead of acting on it. A *long* list of such notes is a splitting smell — re-split. Cross-unit completeness is the plan-level review's job, not the unit gate's.

### Slug

The parser derives the plan slug from the H1 task summary automatically (kebab-case, ≤ 60 chars, alphanumerics only). You don't write a slug field; pick a task summary that produces a sensible slug.

- Example: H1 = `Migrate the auth flow to PKCE` → slug = `migrate-the-auth-flow-to-pkce`.
- If the H1 has no alphanumerics, the parser rejects the plan; pick a different summary.

### Unit IDs and blocked_by

The parser auto-derives unit IDs (`NN-<slug-of-title>`) and sets each unit's `blocked_by` to the previous unit's ID by default — sequential. You don't need to write either.

If two units are genuinely independent tracks that converge later, call that out in the unit body so a reader knows. The materialized plan still serializes them sequentially in the dir listing; non-linear ordering at the plan-markdown level is **not** supported in v1.

### review_steps

You don't emit review info at all. Review pipelines come from the user's config (`~/.claude/plugins/jidoka/config.json`); the materializer resolves them at materialize time and renders them into each Unit md and into `progress.md`'s `## Plan-level review` section. Each configured step is a slash command **or** a `{ run, mode }` bash template (a tool-agnostic command for `codex exec`, cursor-agent, etc.) — but that's the user's config concern, not something you emit or need to reason about when decomposing. If a unit needs a different review approach (e.g. an adversarial second-opinion pass for a foundational change), call it out in the body so the human reviewer takes the right action when the unit lands — the body remains the per-unit escape hatch. The built-in `/code-review` takes no focus argument, so any "pay attention to X" steer for a unit's review also lives in the body prose, not in the command.

### Reference, don't paste

When a unit body needs to talk about existing code, reference it by `path:symbol` (e.g. `ts/config.ts:defaultConfig`, `ts/materialize.ts:resolveTargetDir`) rather than pasting a snippet. A plan is a durable artifact that outlives the code it plans against: a pasted snippet silently goes stale as the code moves, while a `path:symbol` pointer always resolves against current truth. Quote source verbatim only when the exact wording *is* what's being changed (e.g. renaming a specific error string). This keeps materialized plans — and the `completed/` archive they become — honest about what the code actually is.

### Promoting an idea to a plan

jidoka's lifecycle convention parks open questions and proposals as `ideas/<YYMMDD-N-slug>.md` entries (see `exec-plans/AGENTS.md` for the surrounding lifecycle). When the task you're decomposing traces back to such an idea, the plan you emit *is* its promotion: an idea graduates to `exec-plans/active/` the moment it acquires units. Name the source idea in the overview's references so the plan's eventual archive stamp can record which idea it realized. An idea that never gets units stays an idea — open-ended drift is allowed there, not inside a plan.

## Hard Rules

1. **NEVER** call the renderer binary. Return markdown only; the hook (or `jidoka materialize`) handles rendering.
2. **NEVER** execute the plan. The skill is a planner only.
3. **NEVER** loop or ask for approval. One-shot generator.
4. On re-invocation with adjustments, regenerate the **FULL** markdown from scratch — no patching.
5. **NEVER** save the markdown to disk yourself. Return it to the caller; ExitPlanMode delivers it to the hook via `tool_input.plan`.

## Design Constraints

### Why one-shot

`AskUserQuestion` does not surface to the user inside a forked subagent — the fork runs to completion autonomously. The skill produces and returns. The caller (main agent) handles iteration using `AskUserQuestion` at the main-agent level, then re-invokes the skill with feedback baked into the prompt.

### Why fork works inside plan mode

Plan mode blocks Edit, Write, NotebookEdit, and Task tools. The Skill tool isn't restricted. When invoked, the forked subagent operates in its own context — outside plan-mode tool restrictions. It can run Bash and read the codebase to inform decomposition.

### Why the hook reads `tool_input.plan` directly

ExitPlanMode + PreToolUse hooks shipped in Claude Code v2.1.85 (2026-03-26). Before that, jidoka ferried the plan through `/tmp/jidoka-{session_id}.json` because the hook had no way to see what the user was about to approve. Now the markdown is right there in the PreToolUse payload — no temp file, no marker file, no deny-loop.
