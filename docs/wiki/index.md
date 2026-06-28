# wiki/

Settled reference — the durable **"why" and "what"** behind the system as it stands: decisions, rationale, specs. **Current truth**, maintained until changed. This is jidoka's knowledge base, and it is **not** governed by the plan-lifecycle convention — `../CONVENTION.md` covers only `exec-plans/`. Where a repo keeps this (here, `docs/wiki/`) is its own choice.

- **Status: current.** Everything here is true *right now* — grep it freely. When a decision is reversed it is **not** kept here: it `git mv`s to `../exec-plans/completed/` with a `STATUS: superseded · …` stamp (the single home for frozen history), so `wiki/` never accumulates a graveyard.
- **Naming: topic-named** (`cli-over-mcp.md`, `review-pipeline.md`) — referenced by subject, not date. The date lives in each doc.
- **Reading rule.** "Reference, don't paste": capture rationale and point at code by `path:symbol`; trim any snippet that has since drifted.

## Catalog

- **[strategic-review.md](strategic-review.md)** — Pre-implementation review of four strategic risks (competitive overlap, native Claude visualization, plan-mode longevity, agent-agnostic design). Verdict: proceed; the renderer is the portable asset, skills stay platform adapters.
- **[cli-over-mcp.md](cli-over-mcp.md)** — Does jidoka need an MCP server for agent-agnosticism? Verdict: the CLI binary already *is* the agent-agnostic interface; defer MCP to post-v1. (Downgrades strategic-review rec #2.)
- **[googleworkspace-cli.md](googleworkspace-cli.md)** — Productization lessons from `googleworkspace/cli`: CLI-first framing, self-describing flags, skills as thin adapters, early distribution mindset. Confirms cli-over-mcp.
- **[skill-distribution.md](skill-distribution.md)** — One canonical skill source distributed to Claude Code / Codex / Cursor without symlinks. Verdict: copy/sync-based installs + a three-layer local-test strategy.
- **[review-pipeline.md](review-pipeline.md)** — How jidoka's review pipeline uses current Claude Code / codex tooling (built-in `/code-review` per unit; `/jidoka:plan-review-prompt` composer for plan-level). `/goal` deferred.
- **[codex-adversarial-review.md](codex-adversarial-review.md)** — codex's 1MB-diff behavior. Verdict: always invoke `/codex:adversarial-review` so it self-collects the diff. Companion to review-pipeline.
- **[default-plan-dir-root.md](default-plan-dir-root.md)** — Why jidoka's shipped default `plan_dir_root` is the convention's `docs/exec-plans/active/`, not a neutral `plan/`. Verdict: ship the lifecycle batteries-included; opting out is one `.jidoka.json` / setup answer away.
- **[convention-carrier.md](convention-carrier.md)** — How `CONVENTION.md` travels to other repos: jidoka bundles it (copy-to-adopt), no separate `plan-lifecycle` repo yet. Verdict: co-locate doc + driver until copies start to diverge.

> **Reversed decisions** aren't listed here — they live as frozen records in [`../exec-plans/completed/`](../exec-plans/completed/), stamped `superseded` (the diagram-backend, browser-debugging, and Rust-runtime choices, overturned when the topology/HTML subsystem was excised and the renderer moved to TypeScript).
