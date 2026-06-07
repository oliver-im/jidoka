# design-docs/

Settled rationale — the **"why"** behind decisions, current truth until explicitly reversed. The bucket an idea graduates to when the answer is "decided," not "to be built."

- **Status: settled / current.** Unlike `../exec-plans/`, these are *maintained* as living truth: when a decision is reversed, the doc moves to `superseded/` (kept as record) — it is not deleted.
- **Naming: topic-named** (`cli-over-mcp.md`, `mermaid-rendering.md`) — decisions are referenced by subject, not date. The date lives in each doc (title or header); **status is the location** — a doc here is active, one in `superseded/` is reversed.
- **Reading rule.** "Reference, don't paste": capture rationale and point at code by `path:symbol`; trim any snippet that has since drifted.

## Catalog

Active decisions:

- **[strategic-review.md](strategic-review.md)** — Pre-implementation review of four strategic risks (competitive overlap, native Claude visualization, plan-mode longevity, agent-agnostic design). Verdict: proceed; the renderer is the portable asset, skills stay platform adapters.
- **[cli-over-mcp.md](cli-over-mcp.md)** — Does planview need an MCP server for agent-agnosticism? Verdict: the CLI binary already *is* the agent-agnostic interface; defer MCP to post-v1. (Downgrades strategic-review rec #2.)
- **[mermaid-rendering.md](mermaid-rendering.md)** — Which diagram backend? Eight candidates evaluated. Verdict: Mermaid for V1 (only option with native stadium/pill + double-circle); Graphviz WASM is the upgrade path if limits bite.
- **[googleworkspace-cli.md](googleworkspace-cli.md)** — Productization lessons from `googleworkspace/cli`: CLI-first framing, self-describing flags, skills as thin adapters, early distribution mindset. Confirms cli-over-mcp.
- **[browser-debugging.md](browser-debugging.md)** — How to debug planview's rendered HTML. Verdict: Chrome DevTools MCP for debugging, Playwright MCP for automation; skip Browser-Use CLI.
- **[skill-distribution.md](skill-distribution.md)** — One canonical skill source distributed to Claude Code / Codex / Cursor without symlinks. Verdict: copy/sync-based installs + a three-layer local-test strategy.
- **[review-pipeline.md](review-pipeline.md)** — How planview's review pipeline uses current Claude Code / codex tooling (built-in `/code-review` per unit; `/planview:plan-review-prompt` composer for plan-level). `/goal` deferred.
- **[codex-adversarial-review.md](codex-adversarial-review.md)** — codex's 1MB-diff behavior. Verdict: always invoke `/codex:adversarial-review` so it self-collects the diff. Companion to review-pipeline.
- **[default-plan-dir-root.md](default-plan-dir-root.md)** — Why planview's shipped default `plan_dir_root` is the convention's `docs/exec-plans/active/`, not a neutral `plan/`. Verdict: ship the lifecycle batteries-included; opting out is one `.planview.json` / setup answer away.
- **[convention-carrier.md](convention-carrier.md)** — How `CONVENTION.md` travels to other repos: planview bundles it (copy-to-adopt), no separate `plan-lifecycle` repo yet. Verdict: co-locate doc + driver until copies start to diverge.

Superseded:

- **[superseded/rust-runtime.md](superseded/rust-runtime.md)** — Original renderer language/runtime comparison (Rust / Go / Bun / …). Verdict at the time: Rust. **Superseded** — the renderer was reimplemented in TypeScript.
