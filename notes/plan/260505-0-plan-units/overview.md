# 260505-0-plan-units — planview pivot to plan-mode dir materialization

## Goal

Pivot planview from a topology-headlined visualization tool into a plan-mode post-hook that materializes structured plan directories (`overview.md` + per-unit md + `progress.md`), with optional per-unit topology embedded as a Mermaid block. Auto-invoked on `ExitPlanMode`. Existing topology validation, mermaid generation, and HTML rendering are reused at unit scope.

## Context

planview's existing implementation (3156 LOC Rust, last touched Mar 29) headlines multi-agent topology visualization rendered as a browser HTML page from `/tmp`. Subsequent dev-workflow work (`~/hhe/traceclip/notes/research/260505-0-dev-workflow.md`) standardized a file-based plan layout — `notes/plan/<YYMMDD-N-slug>/` with overview/progress/per-unit files — to replace obra/superpowers' monolithic plans. superpowers issue [#512](https://github.com/obra/superpowers/issues/512) confirms maintainers know the monolithic shape is wrong; dir-of-units is the agreed direction.

The headline shifts from "multi-agent topology" to "plan-mode dir materialization, with topology as an optional per-unit artifact". Most plans will produce zero mermaid blocks; a few will produce one or two where parallel dispatch genuinely happens.

## Decisions (locked, v1)

- **Plan dir layout:** `notes/plan/<YYMMDD-N-slug>/overview.md + progress.md + 0N-<unit-slug>.md`. Slug emitted by skill; N derived by scanning existing entries for today across `plan/`, `research/`, `backlog/`, `done/plan/` per `notes/AGENTS.md`.
- **Unit data model (v1, minimal):** `{ id, title, summary, blocked_by[], agents_involved[]?, review_steps[], body_markdown, topology? }`.
- **Topology placement:** per-unit, optional. v1 has no plan-level topology. Single-agent units never carry topology. Most units will have `topology: null`.
- **Output:** markdown files + a single `overview.html` in the plan dir, embedded mermaid where present, auto-opened on materialize (per existing browser-open behavior; configurable in unit 07).
- **Auto-invocation:** `PreToolUse` hook on `ExitPlanMode` denies with instruction if no plan JSON exists, exactly the existing planview pattern. Hook always exits 0.
- **Prompt-injection vector:** plugin manifest ships skill instructions that auto-load — no per-project AGENTS.md required (research finding from `~/hhe/traceclip/notes/research/260505-0-dev-workflow.md` follow-up + 2026 Claude Code plugin docs).
- **Skill output is the breaking change; Topology is not deprecated.** `/planview` now emits Plan, not Topology. The standalone binary CLI continues to accept Topology JSON for direct rendering — that path is unchanged. Topology also remains the data shape for per-unit multi-agent dispatch when a unit carries one. The hook (`planview hook`) accepts Plan only; other shapes in `/tmp` are treated as missing and trigger the standard "run /planview" deny.

## Out of scope (v1)

- Plan-level topology diagram (reserved for v2 if/when worktree-parallel units become a real workflow).
- The `/planview` skill emitting Topology directly (it now emits Plan). Direct topology rendering via the standalone binary CLI is preserved.
- Hook-firing-reliability investigation (issue #21282 — separate concern, not blocking design).
- Per-project config overrides beyond `planDirRoot`.
- Worktree creation by the hook (out of scope; user's own convention).
- `--force` flag for clobbering an existing plan dir.

## Unit list

| # | Title | Blocked by | Reviews |
|---|---|---|---|
| 01 | Housekeeping & scaffolding | — | code-review |
| 02 | Plan + Unit data model | 01 | code-review + agent-cli |
| 03 | Plan dir materialization | 02 | code-review + agent-cli |
| 04 | HTML overview rendering | 02 | code-review |
| 05 | Hook integration update | 03, 04 | code-review + agent-cli |
| 06 | Skill rewrite + agent-guide | 02 | code-review |
| 07 | Config workflow (claude-hud-style) | 05 | code-review + agent-cli |

Sequential cursor execution. `blocked_by` reflects real dependencies but the cursor advances strictly in order — that lets each session start clean from a single unit md.

## Cross-cutting constraints

- Hook always exits 0 (existing invariant; do not regress).
- Mermaid IDs escape hyphens to underscores (existing).
- Plan dir creation idempotent: if target dir exists, error with clear message rather than clobber.
- Validation scope-aware (per nesting level, per existing convention).
- No embedded code bodies in plan files (anti-pattern per dev-workflow doc).
- All filesystem paths in the hook resolved via `$CLAUDE_PROJECT_DIR`, not PWD (claude-code issue [#22343](https://github.com/anthropics/claude-code/issues/22343) — hooks fire with `cwd=~`).

## References

- `~/hhe/traceclip/notes/research/260505-0-dev-workflow.md` — workflow design that motivated this pivot.
- `docs/data-model.md`, `docs/agent-guide.md`, `docs/developer-guide.md` — touched in units 02 + 06.
- `~/hhe/planview/plan/implementation.md` — predecessor single-file plan, kept for context (will not be archived as part of this work).
- superpowers issue [#512](https://github.com/obra/superpowers/issues/512) — external corroboration of dir-of-units direction.
- claude-hud (`https://github.com/jarrodwatts/claude-hud`) — config-workflow reference for unit 07.
