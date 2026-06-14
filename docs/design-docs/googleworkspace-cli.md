# Reference Project Review: `googleworkspace/cli` (March 2026)

What jidoka can learn from [`googleworkspace/cli`](https://github.com/googleworkspace/cli), and what should remain specific to jidoka's much smaller scope.

## Why this project is relevant

[`googleworkspace/cli`](https://github.com/googleworkspace/cli) is a strong reference point because it is:

- A Rust CLI distributed as a native binary
- Explicitly designed for both humans and AI agents
- Built around structured I/O and predictable command behavior
- Packaged together with agent skills, rather than treating skills as a separate afterthought

It is not a domain match for jidoka, but it is a good productization match.

## Key observations

### 1. The CLI is the product, not just an implementation detail

The `gws` README presents the CLI itself as the primary interface for both humans and agents:

- "One CLI for all of Google Workspace"
- "built for humans and AI agents"
- structured JSON output
- schema and dry-run support

This reinforces the conclusion in [`cli-over-mcp.md`](cli-over-mcp.md): jidoka should treat the CLI binary as the main interface, not as a temporary shell transport to be replaced by MCP.

### 2. Self-describing interfaces matter

`gws` makes introspection a first-class feature:

- `gws schema ...`
- `--dry-run`
- predictable help output
- structured exit behavior

For jidoka, this supports the existing direction toward:

- `jidoka --schema`
- `jidoka --validate`
- `jidoka --example --json`

The general lesson: agent-friendly tools should explain themselves at the command line, not only in documentation.

### 3. Human DX and agent DX can be aligned

`gws` does not create one interface for people and another for agents. It makes the normal CLI predictable:

- structured output
- clear install story
- explicit examples
- deterministic behavior

This is a useful model for jidoka. The same command surface should work for:

- a human piping JSON into the binary
- a Claude Code skill invoking the renderer
- a future adapter or wrapper on another agent platform

### 4. Skills are adapters around the CLI, not the core asset

`gws` ships agent skills, but the durable product is still the CLI. That maps well to jidoka's architecture:

- portable renderer binary as the stable core
- Claude-specific skill and hook as platform adapters
- future Cursor/Cline/Copilot integrations as additional adapters

This is a better framing than "agent-agnostic from day one" in the abstract. The binary can be portable before the integrations are.

### 5. Distribution is part of the product

`gws` supports multiple install paths:

- package-manager install
- prebuilt binaries
- source install
- agent/extension installation paths

That is a reminder that "single binary" is necessary but not sufficient. If jidoka works, it will eventually need a clean distribution story such as:

- GitHub Releases first
- Homebrew second
- optional wrapper distribution later if useful

This is likely more important than early MCP support.

### 6. Operational contracts should be explicit

`gws` documents exit codes and behavior clearly. That is a good model for jidoka's renderer and validation modes.

Useful implications for jidoka:

- stdout should remain machine-oriented
- stderr should remain for errors and hints
- exit codes should be stable and documented
- hook mode can still be a special case that always exits `0`

The more deterministic the command contract, the easier it is to reuse from skills, shell scripts, tests, and future wrappers.

## What jidoka should apply

### Apply directly

1. **CLI-first product framing**
   The renderer binary should be treated as the primary product surface.

2. **Self-describing flags**
   Keep `--schema`, `--validate`, and `--example --json` in scope.

3. **Stable command contract**
   Document stdout, stderr, and exit-code behavior before implementation drifts.

4. **Skills as thin adapters**
   Keep platform-specific logic outside the renderer wherever possible.

5. **Early attention to distribution**
   Think about installation and packaging earlier than a typical internal tool would.

## What jidoka should not copy

### 1. Dynamic command generation

`gws` builds its command surface dynamically from Google Discovery documents. That is a good fit for a huge API surface, but not for jidoka.

jidoka should keep:

- a small fixed CLI
- boring predictable flags
- very little runtime indirection

### 2. Authentication and environment complexity

`gws` has to solve OAuth, token precedence, credentials files, and cloud project setup. jidoka should avoid that class of complexity entirely if possible.

One of jidoka's advantages is that it can stay:

- local
- stateless per invocation
- credential-free

### 3. Large skill surface area

`gws` benefits from many skills because it spans many APIs and workflows. jidoka likely does not.

For jidoka, the better pattern is:

- one core skill
- maybe a few thin platform-specific variants later

## Bottom line

[`googleworkspace/cli`](https://github.com/googleworkspace/cli) is evidence that a Rust CLI can successfully serve both humans and AI agents without MCP being the starting point.

The most important transferable lessons for jidoka are:

- the CLI should be a first-class product
- the command surface should be self-describing
- structured behavior matters more than protocol novelty
- skills should wrap the CLI rather than replace it
- packaging and distribution are part of adoption

## Recommendation for jidoka

Use this project as a productization reference, not a feature template.

Good things to borrow:

- CLI-first framing
- schema/validate ergonomics
- explicit contracts
- distribution mindset
- skills as adapters

Things to avoid borrowing:

- dynamic command generation
- auth/config complexity
- broad skill sprawl

In short: copy the discipline, not the surface area.
