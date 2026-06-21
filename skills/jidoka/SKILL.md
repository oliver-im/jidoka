---
name: jidoka
description: Decompose a multi-step task into reviewable units and emit a plan markdown that the ExitPlanMode hook materializes as a directory under <plan_dir_root>/ (default `docs/exec-plans/active/`). Use in plan mode before ExitPlanMode. When the plan crystallizes, structure it as explicit units (## Unit 01: <title>, ## Unit 02: <title>, …) so each unit is reviewable on its own and finishable in one session.
allowed-tools: Read, Grep, Glob, Bash, Write
user-invocable: false
---

# jidoka

You produce a **plan markdown**, write it to the plan-mode plan file, and call ExitPlanMode. The renderer (the ExitPlanMode hook) handles validation and materialization (writing `overview.md` + `progress.md` + per-unit md files). Your job is to analyze the task, decompose it into units, write the conforming markdown to the plan file, and exit plan mode.

## Process

### Step 1: Analyze and produce a plan

Read the codebase using Read, Grep, Glob, and Bash, then decompose the task into the markdown shape below.

### Step 2: Write the plan to the plan file, then call ExitPlanMode

Plan mode designates a **plan file** for this session — its path is shown in the plan-mode reminder in your context (as the plan file path / `planFilePath`, e.g. `~/.claude/plans/<name>.md`). Do these two things, in order:

1. **Write the complete plan markdown to that plan file** with the Write tool. Write raw markdown — the `# Title` H1 + `## Unit NN:` sections in the shape below, with **no** outer ` ```markdown ` fence. This file is what the user reviews in the approval dialog, and it is the only channel by which the plan reaches the renderer.
2. **Call ExitPlanMode.** When it fires, the harness reads the plan file you just wrote and passes its content to the jidoka hook as `tool_input.plan`; the hook validates and materializes the plan dir. You do **not** pass the markdown as a tool argument — current ExitPlanMode has no `plan` parameter, so the file *is* the channel.

If you skip the write, the plan file stays empty, the hook receives nothing, and materialization **fails loudly** — the hook denies ExitPlanMode with an explanation instead of silently doing nothing. So always write the file first. If the plan needs changes, regenerate the whole thing from scratch and re-write the file rather than patching a prior draft (one-shot — see below).

> Compatibility: older harnesses (before the plan-file mechanism) took the markdown as an inline `plan` argument to ExitPlanMode. Writing the plan file is the current path; if you find yourself on an older harness whose ExitPlanMode still surfaces a `plan` parameter, pass the same markdown there as well. The renderer reads `tool_input.plan` either way, and the parser also tolerates an accidental outer ` ```markdown ` fence — so writing the file is always safe.

## Markdown shape

```
# <task summary>

## Unit 01: <title>

<one or two sentences — what this unit accomplishes>

<rest of the body — Tasks, Acceptance, Notes, etc.>

## Unit 02: <title>

<summary>

<body>

...
```

The `# Title` H1 (exactly one `#`, followed by a space) is the task summary, used to derive the plan slug. Always emit a `# Title` H1 above any `## Unit NN:` heading — if a `## Unit NN:` line appears before the H1 the parser rejects the plan. (Fallback: if no H1 is present, the first non-blank line of leading prose is taken as the title — fine for hand-written drafts but not what you should emit.)

Each `## Unit NN: <title>` heading starts a new unit; the first paragraph after the heading is the unit summary, the rest is the body.

Tolerated heading variants (the parser canonicalizes them — pick whichever reads best):

```
## Unit 1: Foo            single-digit number
## Step 01: Foo           "Step" instead of "Unit"
## 01: Foo                bare number, colon
## 01. Foo                bare number, period
## 01 - Foo               bare number, hyphen
## 01 — Foo               bare number, em-dash
```

## Heuristics

### Unit splitting

Each unit must be:

1. **Reviewable on its own** — a code review or adversarial-review pass can check it without needing context from sibling units. The sharp test: can you build / test / run this slice independently? Prefer a vertical slice you can exercise on its own over a horizontal layer that only makes sense once a later unit wires it up.
2. **Finishable in one session including reviews** — the work, the review, the fixes, and the commit all fit in one focused pass.

No fixed line/time budget. Most plans land at **3–7 units**. Two-unit plans are rare; ten-unit plans usually want to split into two plans.

### Slug

The parser derives the plan slug from the H1 task summary automatically (kebab-case, ≤ 60 chars, `^[a-z0-9-]+$`, alphanumerics only). You don't write a slug field; pick a task summary that produces a sensible slug. Example: H1 = `Migrate the auth flow to PKCE` → slug = `migrate-the-auth-flow-to-pkce`.

If the H1 has no alphanumerics, the parser rejects the plan; pick a different summary.

### Unit IDs and blocked_by between units

The parser auto-derives unit IDs (`NN-<slug-of-title>`) and sets each unit's `blocked_by` to the previous unit's ID by default — sequential. You don't need to write either.

If two units genuinely run in parallel (independent tracks that converge later), call that out in the unit body so a reader knows; the materialized plan still serializes them sequentially in the dir listing, but reviewers can read your note. Non-linear ordering at the plan-markdown level is **not** supported in v1.

### review_steps

You don't emit review info at all. Review pipelines come from the user's config at `~/.claude/plugins/jidoka/config.json`; the materializer resolves them and renders the result into each Unit md (`## Review pipeline`) and `progress.md` (`## Plan-level review`). If a unit needs a different review approach (e.g. an adversarial second-opinion pass for a foundational change), call it out in the body — the body is the per-unit escape hatch when the configured pipeline doesn't fit.

### Reference, don't paste

In unit bodies, point at code by `path:symbol` (e.g. `ts/config.ts:defaultConfig`, `ts/materialize.ts:resolveTargetDir`) instead of pasting source snippets. A plan outlives the code it describes: a pasted snippet silently drifts out of date, while a `path:symbol` reference stays a pointer the reader resolves against current truth. Quote a line verbatim only when its exact wording *is* the subject of the change.

### Promoting an idea to a plan

When the task traces back to an `ideas/<YYMMDD-N-slug>.md` entry (an open question parked under the lifecycle convention), emitting a plan *is* that idea's promotion: it graduates to `exec-plans/active/` the moment it acquires units. Name the source idea in the overview's references so the plan's eventual archive can record what it realized. An idea with no units stays an idea.

## Contract

- **Output**: one markdown plan (the `# Title` + `## Unit NN:` shape), written verbatim to the plan-mode plan file; then ExitPlanMode is called. The renderer reads it from `tool_input.plan`, which the harness populates from that file.
- **One-shot**: produce the complete plan in a single pass. On re-invocation regenerate the full markdown from scratch — no patching of prior output.
- **Scope is read-only analysis + writing the plan file + calling ExitPlanMode.** Everything downstream is out of scope — the hook materializes the dir; the resuming agent executes units and runs reviews. None of it is the skill's job.

## Design Constraints

### Runs inline, not as a fork

This skill has no `context: fork` in its frontmatter, so Claude Code runs it **inline** — its instructions enter the *same* context the planning agent is already in (composing with plan mode's native prompt), rather than spawning an isolated subagent. That's deliberate: inline, the skill sees the live plan-mode conversation — the task as it developed, the codebase notes, the back-and-forth with the user — which is exactly the raw material decomposition needs. A `context: fork` subagent would start blind, with only this file as its prompt.

Inline keeps the skill under plan mode's restrictions. Plan mode blocks mutating tools in general (Edit, NotebookEdit, Task) but **permits writing the session's designated plan file** — which is exactly what Step 2 does. Apart from that one sanctioned write, the skill uses only read-only analysis tools (Read, Grep, Glob, and Bash for inspection). `allowed-tools` lists `Write` so the plan-file write is pre-approved rather than prompting.

### Why one-shot

One-shot is a **design choice, not a platform limit.** The skill isn't barred from `AskUserQuestion` — inline skills inherit the agent's tools, `allowed-tools` pre-approves rather than restricts, and plan mode itself permits clarifying questions — but it deliberately doesn't ask. It does one thing: analyze the task and emit a complete plan in a single pass. Clarification and iteration live one level up — the agent gathers what it needs (via `AskUserQuestion` in the normal plan-mode loop, before or after running the skill) and re-runs the skill with that folded in, regenerating the whole plan rather than patching. Every invocation yields a fresh, complete plan, which keeps the renderer's input simple.
