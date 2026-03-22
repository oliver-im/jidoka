# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

agent-topology is a Claude Code plugin that visualizes multi-agent task decomposition as Mermaid diagrams in the browser. It has two components:

- **Skill** (forked subagent) — LLM analyzes a task, produces topology JSON, saves to `/tmp/agent-topology-{session_id}.json`
- **Renderer** (compiled Bun binary) — deterministic CLI that validates JSON, generates Mermaid graphs + HTML, opens browser. Never calls the LLM.

The contract between them: `echo '<topology JSON>' | agent-topology` → stdout is the HTML file path, exit 0 on success.

## Repository State

This is currently a **documentation-only repo** — the specification is complete but no source code exists yet. The docs are the implementation blueprint:

- `docs/data-model.md` — JSON schema, field semantics, execution modes (shared by both audiences)
- `docs/agent-guide.md` — skill config, heuristics, hard rules (for LLM agents)
- `docs/developer-guide.md` — architecture, validation rules, algorithms, CLI, hooks, design decisions (for developers building the renderer)

## Key Architecture Concepts

- **Execution modes:** `subagents` (default, hub-and-spoke, phased dispatch) vs `team` (agents self-coordinate via SendMessage)
- **Hook integration:** PreToolUse hook on ExitPlanMode renders plan+diagram before user approval. If no topology exists, hook denies with instruction to run `/agent-topology` first (max 3 attempts, then falls through).
- **One-shot skill:** AskUserQuestion doesn't surface inside forks. Skill generates and returns; caller handles iteration by re-invoking with feedback.
- **Topology is advisory:** shows intended plan, not enforced execution. Arrows = data flow/order, rectangles = communication boundaries.

## When Implementing

- **Renderer must always exit 0** in hook mode — non-zero blocks ExitPlanMode permanently
- **Validation is scope-aware** — `blocked_by` references checked per nesting level, not globally
- **Mermaid ID escaping** — hyphens in agent IDs → underscores (Mermaid limitation)
- **Agent IDs** must match `^[a-zA-Z0-9_-]+$` to prevent HTML injection in Mermaid labels
- **Runtime:** Bun (build, test, compile to single binary)
