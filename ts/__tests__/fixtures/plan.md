# Refactor planview pipeline to plan-md

This is preamble prose. The parser should ignore it for unit detection but keep the H1 above as the task summary.

## Unit 01: Markdown parser

Add `ts/parse-markdown.ts` that takes a markdown plan and returns a `Plan`. Tolerate `## Step` and bare-number heading variants.

### Tasks

- Implement the parser.
- Add fixtures and tests.

### Acceptance

- `npm test` passes; `validatePlan(parsed.value)` returns `[]` on this fixture.

## Unit 2: Hook reads tool_input.plan

Rewrite `ts/hook.ts` to read the plan markdown from PreToolUse stdin instead of the `/tmp` ferry file. Hook still always exits 0.

### Tasks

- Drop the deny-loop, marker file, and `max_deny_attempts` config knob.
- Validate the parsed plan; on failure, write to stderr and exit 0.

## Step 03: CLI trim

Drop the topology subcommands. The CLI accepts plan markdown on stdin and renders the dir.

## 04 — Delete topology renderer

Remove `ts/mermaid.ts`, `ts/describe.ts`, `ts/graph.ts`, `ts/example.ts`, and their tests + fixtures.

## 05. Trim Plan types

Remove `Topology`, `Agent`, and friends from `ts/types.ts`. Slim `validatePlan` accordingly.

## Unit 06: Skill emits markdown

Rewrite `.claude/skills/planview/SKILL.md` to produce markdown (not JSON), preserving the unit-splitting heuristics.

## Unit 07: Docs

Rewrite README, developer-guide, data-model, AGENTS.md to reflect the new pipeline.
