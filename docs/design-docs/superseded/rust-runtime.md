> **STATUS: superseded** · chose Rust here (Mar 2026); the renderer was later reimplemented in TypeScript · kept as record. The verdict below ("Rust wins") no longer reflects the codebase — it documents why Rust was chosen at the time, and by extension what the TS migration traded away.

# Tech Stack Analysis (March 2026)

Evaluation of runtime/language options for the planview renderer, prioritizing technical merits over development velocity.

## Workload Profile

The renderer reads JSON from stdin, validates against 18 rules, generates Mermaid text + HTML, writes to `/tmp`, and spawns `open` for the browser. Also needs to function as an MCP server (stdio transport). No Puppeteer/headless browser — Mermaid renders client-side. This is a lightweight text-processing CLI.

## Candidates

### Evaluated

| | Rust | Go | Bun (TS) | Deno (TS) | Swift | Zig |
|---|---|---|---|---|---|---|
| Binary size | 1–3 MB | 3–6 MB | ~91 MB | ~80 MB | 8–15 MB | 200–500 KB |
| Startup | ~1 ms | ~2 ms | ~8–18 ms | ~40–60 ms | ~5–15 ms | < 1 ms |
| JSON validation | serde (best-in-class) | encoding/json + boilerplate | Zod (most concise) | Zod | Codable (clean) | manual (painful) |
| String/text gen | Moderate | Good (fmt, templates) | Excellent (template literals) | Excellent | Good (interpolation) | Poor (manual buffers) |
| MCP SDK | Official, Tier 2, production (`rmcp`) | Official, Tier 1, stabilizing | Reference impl (best) | Works via TS SDK | Official, Tier 3 | None |
| Single binary | Native, reliable | Native, reliable | `--compile` has [documented bugs](https://github.com/oven-sh/bun/issues/24470) | More stable than Bun | Native, macOS easy | Native, reliable |
| Cross-compilation | Good (via `cross`) | Best (one env var) | Good (`--target`) | Good (`--target`) | Weak (Linux needs SDK) | Excellent |
| Determinism | Need BTreeMap | Need sorted keys | Natural (insertion order) | Natural | Need sorted keys | Need sorting |
| Maturity | Stable | Stable | Medium-high risk | Medium risk | Stable on macOS | Pre-1.0 (0.14.x) |

### Eliminated

**Zig** — No MCP SDK (dealbreaker). Pre-1.0 instability. Manual JSON/string handling for 18 validation rules is unjustifiable.

**Deno** — 80 MB binary, 40–60 ms startup (worst of all candidates), no advantage over Bun for this workload.

**Swift** — Linux distribution is difficult (Static Linux SDK produces 100+ MB debug builds). The spec calls for eventual cross-platform support.

## The Three-Way Race

### Rust

**Strengths:**
- 1–3 MB binary — 30–90x smaller than Bun. No JavaScript engine embedded for a text processor.
- ~1 ms startup — fastest practical option. Matters for the PreToolUse hook on every ExitPlanMode.
- serde — compile-time derive macros, zero-cost deserialization, 300–430 MB/s parsing. The 18 validation rules map to Rust's type system: enums for `execution_mode`, regex validation via derive macros, scope-aware `blocked_by` via recursive functions with ownership guarantees.
- `rmcp` MCP SDK — production-ready, stdio transport, proc macros for tool definition.
- Compilation is reliable. `cargo build --release` always produces a correct binary.

**Weaknesses:**
- String generation for Mermaid/HTML is less ergonomic than template literals. Mitigated by Askama (compile-time templates).
- Cross-compilation requires `cross` tool (more setup than Go).

### Go

**Strengths:**
- 3–6 MB binary — still excellent, 15–30x smaller than Bun.
- ~2 ms startup — near-instantaneous.
- Best cross-compilation story of any language: `GOOS=linux GOARCH=amd64 go build`.
- `text/template` in stdlib is well-suited for Mermaid/HTML generation.
- Cobra CLI framework used by Docker, kubectl, gh, terraform.
- Official MCP SDK (Tier 1), stabilizing.

**Weaknesses:**
- `map` iteration is intentionally randomized — must sort keys for deterministic output (a known footgun).
- JSON validation requires more boilerplate than serde (no derive macros).
- MCP SDK is newer and less battle-tested than TypeScript or Rust.

### Bun (TypeScript)

**Strengths:**
- TypeScript SDK is the MCP reference implementation — most docs, most examples, most battle-tested.
- Template literals are the most natural way to generate Mermaid syntax and HTML.
- Zod schemas are the most concise way to express 18 validation rules.
- Natural determinism — Map/Object preserves insertion order.
- Claude Code itself is built on Bun. Anthropic acquired Bun.

**Weaknesses:**
- 91 MB binary — embeds entire JavaScriptCore engine for a tool that generates ~200 lines of text output.
- `bun build --compile` has documented issues: [binaries only working on build machine](https://github.com/oven-sh/bun/issues/24470), [not truly standalone](https://github.com/oven-sh/bun/issues/14676), [garbage code](https://github.com/oven-sh/bun/issues/19498).
- 4.8k open issues, 34% native dependency compatibility rate.
- 8–18 ms startup (acceptable, but 8–18x slower than Rust).

## What Similar Tools Use

**MCP servers:** Overwhelmingly TypeScript/Node. Official reference servers are all TS. Go and Rust MCP servers exist but are uncommon.

**Developer CLI tools:** Go dominates — Docker, kubectl, gh, terraform, hugo. Rust is the growing alternative — ripgrep, fd, bat, delta, starship.

**Claude Code ecosystem:** Claude Code itself is Bun+TypeScript (with embedded Rust streaming component). Community hooks/tools split across Bash, Go, Rust, Python.

**Mermaid tools:** mermaid-cli and Mermaid MCP servers use TypeScript+Puppeteer, but planview doesn't need Puppeteer (client-side rendering).

## Dimension-by-Dimension Winner

| Dimension | Winner | Why |
|---|---|---|
| Binary size | Rust (1–3 MB) | 30–90x smaller than Bun |
| Startup time | Rust (~1 ms) | 8–18x faster than Bun |
| JSON validation | Rust (serde) | Compile-time safety, zero-cost abstractions |
| String generation | Bun (TypeScript) | Template literals most natural for Mermaid/HTML |
| MCP SDK | Bun (TypeScript) | Reference implementation |
| Determinism | Bun (TypeScript) | Insertion-order maps, no footguns |
| Cross-compilation | Go | One env var, no toolchain setup |
| Binary reliability | Rust/Go (tie) | No documented compilation bugs |

## Verdict

**On pure technical merits, Rust wins.**

1. Binary size is the strongest differentiator. 2 MB vs 91 MB is not marginal — it's embedding an entire JavaScript engine for a tool that validates JSON and concatenates strings.
2. serde is the best JSON validation story for the 18-rule schema.
3. ~1 ms startup is fastest for the interactive hook use case.
4. `rmcp` MCP SDK is production-ready.
5. `cargo build --release` always produces a correct, portable binary.

The trade-off is string generation ergonomics (mitigated by Askama compile-time templates).

**Go is the close second** — slightly larger binaries (3–6 MB, still excellent), slightly slower startup (2 ms, still excellent), easiest cross-compilation, and more ergonomic string handling.

**Bun is the pragmatic choice** (aligned with Claude Code's own stack) but technically unjustifiable for embedding a 91 MB JavaScript engine to validate JSON and concatenate strings.

## Sources

- [Bun single-file executable docs](https://bun.sh/docs/bundler/executables)
- [Bun issue #5854 — binary size reduction request](https://github.com/oven-sh/bun/issues/5854) (open since 2023)
- [Bun issue #24470 — binary only works on build machine](https://github.com/oven-sh/bun/issues/24470)
- [Bun issue #14676 — not truly standalone](https://github.com/oven-sh/bun/issues/14676)
- [Deno 1.41 — smaller compile binaries](https://deno.com/blog/v1.41)
- [MCP official SDKs](https://modelcontextprotocol.io/docs/sdk)
- [MCP Rust SDK (rmcp)](https://github.com/modelcontextprotocol/rust-sdk)
- [MCP Go SDK](https://github.com/modelcontextprotocol/go-sdk)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [min-sized-rust](https://github.com/johnthagen/min-sized-rust)
- [JS vs Go executable size comparison](https://www.seanmcp.com/articles/quick-comparison-of-javascript-and-go-executables/)
- [Cobra CLI framework](https://cobra.dev/)
- [Mermaid-cli](https://github.com/mermaid-js/mermaid-cli)
- [Claude Code architecture](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)
