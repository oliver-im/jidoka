# Agent Guide: Producing Plan Markdown

> See [Data Model](data-model.md) for the underlying types (Plan and Unit) and field semantics.

## Overview

You produce **plan markdown**. The renderer (the ExitPlanMode hook, or `jidoka materialize` from the CLI) parses it, validates the result, and writes the materialized plan dir. Your job is to analyze the task, decompose it into reviewable units, and emit conforming markdown.

## Skill Configuration

```
name: jidoka
user-invocable: false
allowed-tools: Read, Grep, Glob, Bash, Write
```

No `context: fork` — the skill runs **inline** in the planning agent's context (see [Design Constraints](#design-constraints)).

## Process

### Step 1: Analyze and produce a plan

Read the codebase using Read, Grep, Glob, then decompose the task into the markdown shape described in [Data Model — Plan markdown shape](data-model.md#plan-markdown-shape).

### Step 2: Write the plan to the plan file, then call ExitPlanMode

Plan mode designates a **plan file** for the session — its path is in the plan-mode reminder in your context (shown as the plan file path / `planFilePath`). Write the complete plan markdown to that file (raw markdown — the `# Title` H1 + `## Unit NN:` sections, **no** outer ` ```markdown ` fence), then call `ExitPlanMode`. When it fires, the harness reads the plan file and passes its content to the hook as `tool_input.plan`; current ExitPlanMode has no `plan` parameter, so the file *is* the channel. If the plan needs changes, regenerate the whole thing from scratch and re-write the file rather than patching a prior draft (one-shot — see [Design Constraints](#design-constraints)).

If the plan file is never written, the hook receives nothing and **denies ExitPlanMode loudly** instead of silently materializing nothing — so always write the file first.

## Heuristics

### Unit splitting

Each unit must satisfy these constraints:

1. **Reviewable on its own.** A code-review or adversarial-review pass on the unit's diff should be meaningful without context from sibling units. If reviewing unit 03 requires understanding units 01–02 simultaneously, you've split incorrectly. The sharp test: can you build / test / run this slice independently? Prefer a vertical slice you can exercise on its own over a horizontal layer that only makes sense once a later unit wires it up — if the slice can be tested, the per-unit review gate has something coherent to judge.
2. **Finishable in one session including reviews.** The work, the review, the fixes, and the commit all fit in one focused session. If a unit takes three sessions, split it.

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

### Promoting a backlog item to a plan

jidoka's lifecycle convention parks candidate work — open questions, proposals, spikes — as backlog entries (`<backlog>/<YYMMDD-N-slug>.md`; the default layout is `docs/exec-plans/backlog/`, but `jidoka paths` resolves the configured location — see `exec-plans/AGENTS.md` for the surrounding lifecycle). When the task you're decomposing traces back to such a backlog item, the plan you emit *is* its promotion: a backlog item graduates to the active plan dir the moment it acquires units. Name the source item in the overview's references so the plan's eventual archive stamp can record what it realized. A backlog item that never gets units stays in the backlog — open-ended drift is allowed there, not inside a plan.

## Hard Rules

1. **NEVER** call the renderer binary. Return markdown only; the hook (or `jidoka materialize`) handles rendering.
2. **NEVER** execute the plan. The skill is a planner only.
3. **NEVER** loop or ask for approval. One-shot generator.
4. On re-invocation with adjustments, regenerate the **FULL** markdown from scratch — no patching.
5. **ALWAYS** write the complete plan markdown to the plan-mode plan file before calling `ExitPlanMode`. That file is the only channel to the hook (which reads it from `tool_input.plan`, populated by the harness from the file). Do not rely on an inline `plan` argument — current ExitPlanMode has no such parameter. (The plan file is the one disk write the skill makes; never write anything else.)

## Design Constraints

### Runs inline, not as a fork

The skill has no `context: fork` in its frontmatter, so Claude Code runs it **inline** — its instructions enter the *same* context the planning agent is already in (composing with plan mode's native prompt) rather than spawning an isolated subagent. That's deliberate: inline, the skill sees the live plan-mode conversation — the task as it developed, the codebase notes, the back-and-forth with the user — which is exactly the raw material decomposition needs. A `context: fork` subagent would start blind, with only the skill file as its prompt. Inline keeps the skill under plan mode's restrictions: plan mode blocks mutating tools in general (Edit, NotebookEdit, Task) but permits writing the session's designated plan file — the one write Step 2 makes — alongside the read-only analysis tools (Read, Grep, Glob, Bash); `allowed-tools` pre-approves these (including `Write`, for the plan file) so they don't prompt.

### Why one-shot

One-shot is a **design choice, not a platform limit.** The skill isn't barred from `AskUserQuestion` — inline skills inherit the agent's tools and plan mode itself permits clarifying questions — but it deliberately doesn't ask. It does one thing: analyze the task and emit a complete plan in a single pass. Clarification and iteration live one level up — the agent gathers what it needs (via `AskUserQuestion` in the normal plan-mode loop) and re-runs the skill with that folded in, regenerating the whole plan rather than patching.

### Why the hook reads `tool_input.plan` (sourced from the plan file)

ExitPlanMode + PreToolUse hooks shipped in Claude Code v2.1.85 (2026-03-26); before that, jidoka ferried the plan through `/tmp/jidoka-{session_id}.json` because the hook had no way to see what the user was about to approve. Early ExitPlanMode took the plan as an inline `plan` argument that landed directly in `tool_input.plan`. The current harness (verified on 2.1.173) instead has the agent **write the plan to a designated plan file**; when ExitPlanMode fires, the harness reads that file and injects its content into the PreToolUse payload as `tool_input.plan` (and the path as `tool_input.planFilePath`) — even when the model passed only `allowedPrompts`. So the hook still reads `tool_input.plan`; what changed is the source (a file the agent writes, not an inline arg). The hook falls back to reading `planFilePath` if the inlined copy is ever absent, and denies loudly if both are empty — no temp file, no marker file, no deny-loop.
