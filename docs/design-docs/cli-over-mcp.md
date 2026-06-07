# CLI vs MCP for Agent-Agnostic Design (March 2026)

Whether planview's renderer needs an MCP server mode for agent-agnosticism, or whether the CLI binary is already the portable interface.

## Context

The [strategic review](strategic-review.md) recommended "design the renderer as an MCP server from day one" as the highest-leverage change for agent-agnosticism. This document re-evaluates that recommendation.

## Source Material

Two arguments against MCP-first design:

- [Justin Poehnelt — Rewrite Your CLI for AI Agents](https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents/) (Google Workspace CLI author)
- [Eric Holmes — MCP Is Dead, Long Live the CLI](https://ejholmes.github.io/2026/02/28/mcp-is-dead-long-live-the-cli.html)

## The Arguments

### Poehnelt (CLI-first, MCP-optional)

Core thesis: **"Human DX optimizes for discoverability. Agent DX optimizes for predictability."**

- Agents are legitimate first-class CLI users — they don't need protocol wrappers to call tools.
- JSON in/out is what agents need. Custom flags and interactive prompts are the problem, not the lack of MCP.
- MCP eliminates shell escaping ambiguity, but a CLI that already takes JSON on stdin has no escaping ambiguity.
- Recommends CLI-first with optional MCP layering, not MCP replacement.

### Holmes (CLI-only, MCP is overhead)

Core thesis: **LLMs are trained on CLIs. MCP is an unnecessary protocol layer.**

- MCP obscures debugging — "spelunking through JSON transport logs instead of just running the command myself."
- CLIs are composable (piping, chaining, redirection). MCP forces all-or-nothing output.
- CLIs are static binaries with no background processes, initialization, or state. MCP servers must start up, stay running, and not silently hang.
- Authentication fragmentation — MCP creates redundant auth when existing tools already work for both humans and agents.
- "Ship a good API, then ship a good CLI. The agents will figure it out."

## Application to planview

planview's renderer already matches the CLI-first pattern both articles advocate:

| Property | planview renderer | MCP requirement? |
|---|---|---|
| Input | JSON on stdin | No — already structured, no escaping ambiguity |
| Output | File path on stdout, exit code | No — already machine-readable |
| State | Stateless, single invocation | No — nothing to keep alive |
| Auth | None | No — no credentials involved |
| Composability | `echo JSON \| planview`, `planview file.json --mermaid \| pbcopy` | MCP would lose this |
| Background process | None — runs and exits | MCP would require one |
| Debugging | `echo JSON \| planview` reproduces any issue | MCP adds transport layer to debug through |

Every coding agent that can run shell commands (Cursor, Cline, Copilot, OpenHands — all of them) can call `echo '<json>' | planview` today. The CLI binary **is** the agent-agnostic interface.

## What an MCP wrapper would add

An MCP server wrapping planview would:
1. Start a background process (stdio or HTTP transport)
2. Accept JSON-RPC calls with the topology JSON as a parameter
3. Call the CLI binary internally
4. Return the result over JSON-RPC

This adds a process lifecycle, transport layer, and initialization sequence — all to avoid shell-invoking a binary that already takes JSON on stdin. The only benefit is standardized tool discovery (agents auto-discover MCP tools), but planview is invoked by a skill prompt that already knows the binary exists.

## What the CLI already needs (and doesn't have)

Both articles identify patterns planview should adopt regardless of MCP:

- **`--output json`** — already planned (`--mermaid` outputs raw Mermaid; could add `--json` to echo back validated/normalized JSON)
- **Schema introspection** — `planview --schema` could dump the JSON schema, letting agents self-serve validation rules
- **`--dry-run`** — `planview --validate` could validate without rendering or opening browser
- **`--example --json`** — already in the spec, dumps showcase JSON to stdout

These are CLI-level improvements that make the binary more agent-friendly without MCP.

## Revised recommendation

The [strategic review](strategic-review.md) recommendation #2 ("MCP server from day one") should be downgraded:

1. **Build the CLI binary first.** It is already the agent-agnostic interface.
2. **Add agent-friendly CLI flags** (`--schema`, `--validate`) that make the binary self-describing.
3. **Defer MCP to post-v1** — if demand materializes from non-Claude Code agents that prefer MCP over shell invocation. A thin MCP wrapper around the binary is trivial to add later in any language.

## Impact on tech stack

MCP SDK availability was weighted as a primary criterion in the [tech stack analysis](superseded/rust-runtime.md). With MCP deferred, this criterion drops to "nice to have" and the ranking simplifies to: binary size, startup time, JSON validation, string generation, compilation reliability.
