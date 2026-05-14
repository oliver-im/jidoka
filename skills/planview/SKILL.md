---
name: planview
description: Decompose a multi-step task into reviewable units and emit a plan markdown that the ExitPlanMode hook materializes as a directory under <plan_dir_root>/ (default `plan/`). Use in plan mode before ExitPlanMode. When the plan crystallizes, structure it as explicit units (## Unit 01: <title>, ## Unit 02: <title>, …) so each unit is reviewable on its own and finishable in one session.
allowed-tools: Read, Grep, Glob, Bash
user-invocable: false
---

# planview

You produce a **plan markdown** for the caller. The renderer (the ExitPlanMode hook) handles validation, materialization (writing `overview.md` + `progress.md` + per-unit md files), HTML rendering, and browser launch. Your job is to analyze the task, decompose it into units, and output conforming markdown.

A unit may carry an optional **topology** fence when it dispatches multiple agents in a meaningful structure. Most units have no topology fence.

## Process

### Step 1: Analyze and produce a plan

Read the codebase using Read, Grep, Glob, then decompose the task into the markdown shape below.

### Step 2: Return the markdown

Output the complete plan markdown in a single ` ```markdown ` fence so the caller can copy-paste it into ExitPlanMode's `plan` argument. The caller (main agent) decides what to do — typically reviews and either accepts (calls ExitPlanMode) or re-invokes you with adjustments.

You do **not** save the markdown anywhere. The hook reads it directly from PreToolUse stdin's `tool_input.plan` field when ExitPlanMode fires; nothing else needs to mediate.

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

### Per-unit topology fence

When a unit dispatches multiple agents, embed a topology JSON in a fenced block whose info string is exactly `topology`:

````markdown
## Unit 03: Parallel review

Two reviewers run concurrently against the same diff.

```topology
{
  "task_summary": "Parallel review",
  "execution_mode": "subagents",
  "agents": [
    {
      "id": "reviewer-a",
      "role": "Reviews CLAUDE.md compliance",
      "model": "sonnet",
      "tools": ["Read", "Grep"],
      "blocked_by": [],
      "background": false
    },
    {
      "id": "reviewer-b",
      "role": "Reviews for security issues",
      "model": "sonnet",
      "tools": ["Read", "Grep"],
      "blocked_by": [],
      "background": false
    }
  ]
}
```

Acceptance: both reviewers post findings to the parent agent.
````

The parser extracts and validates the JSON, attaches it to the unit, and strips the fence from the body so the renderer doesn't draw the graph twice. Use one fence per unit at most.

## Topology shape

```typescript
interface Topology {
  task_summary: string;            // informational when nested under a Unit
  execution_mode: "team" | "subagents";
  agents: Agent[];
}

interface Agent {
  id: string;                      // ^[a-zA-Z0-9_-]+$
  role: string;
  model: "haiku" | "sonnet" | "opus";
  tools: string[];
  blocked_by: string[];
  background: boolean;
  output?: "inline" | { file: string };  // default "inline"
  produces?: string;
  execution_mode?: "team" | "subagents";  // when this agent dispatches sub-agents
  agents?: Agent[];                       // nested
}
```

See [`docs/data-model.md`](../../../docs/data-model.md) for full field semantics, examples, and execution-mode behavior.

## Heuristics

### Unit splitting

Each unit must be:

1. **Reviewable on its own** — a code review or adversarial-review pass can check it without needing context from sibling units.
2. **Finishable in one session including reviews** — the work, the review, the fixes, and the commit all fit in one focused pass.

No fixed line/time budget. Most plans land at **3–7 units**. Two-unit plans are rare; ten-unit plans usually want to split into two plans.

### Topology decision

Default to no topology fence. Only attach one when a unit:

- Dispatches **more than one agent** with **meaningful structure** — e.g. parallel review by two distinct roles, a writer + a tester running concurrently, or a researcher whose output feeds an implementer.

Single-agent units (just "main does the work") **never carry a topology fence**. If you find yourself writing a one-agent topology, drop it — the unit is single-agent.

### Slug

The parser derives the plan slug from the H1 task summary automatically (kebab-case, ≤ 60 chars, `^[a-z0-9-]+$`, alphanumerics only). You don't write a slug field; pick a task summary that produces a sensible slug. Example: H1 = `Migrate the auth flow to PKCE` → slug = `migrate-the-auth-flow-to-pkce`.

If the H1 has no alphanumerics, the parser rejects the plan; pick a different summary.

### Unit IDs and blocked_by between units

The parser auto-derives unit IDs (`NN-<slug-of-title>`) and sets each unit's `blocked_by` to the previous unit's ID by default — sequential. You don't need to write either.

If two units genuinely run in parallel (independent tracks that converge later), call that out in the unit body so a reader knows; the materialized plan still serializes them sequentially in the dir listing, but reviewers can read your note. Non-linear ordering at the plan-markdown level is **not** supported in v1.

### review_steps

You don't emit review info at all. Review pipelines come from the user's config at `~/.claude/plugins/planview/config.json`; the materializer resolves them and renders the result into each Unit md (`## Review pipeline`) and `progress.md` (`## Plan-level review`). If a unit needs a different review approach (e.g. an adversarial second-opinion pass for a foundational change), call it out in the body — the body is the per-unit escape hatch when the configured pipeline doesn't fit.

## Hard Rules

1. **NEVER** generate HTML. The renderer handles that.
2. **NEVER** call the renderer binary. Return markdown only; the hook (or `planview materialize`) handles rendering.
3. **NEVER** execute the plan. The skill is a planner only.
4. **NEVER** loop or ask for approval. One-shot generator.
5. On re-invocation with adjustments, regenerate the **FULL** markdown from scratch — no patching.
6. **NEVER** save the markdown to disk yourself. Return it to the caller; ExitPlanMode delivers it to the hook via `tool_input.plan`.

## Design Constraints

### Why one-shot

`AskUserQuestion` does not surface inside a forked subagent — the fork runs to completion autonomously. The skill produces and returns. The caller (main agent) handles iteration using `AskUserQuestion` at the main-agent level, then re-invokes the skill with feedback baked into the prompt.

### Why fork works inside plan mode

Plan mode blocks Edit, Write, NotebookEdit, and Task tools. The Skill tool isn't restricted. When invoked, the forked subagent operates in its own context — outside plan-mode tool restrictions. It can run Bash and read the codebase to inform decomposition.

### Why a per-unit topology fence, not a plan-level one

The plan-level shape is "a list of units in order." Topology is for the within-unit dispatch pattern when a unit really does dispatch multiple agents. v1 deliberately omits a plan-level topology diagram; the plan dir + per-unit topology fence covers the cases where multi-agent visualization helps.
