# planview: Implementation Plan

## Context

planview is a documentation-only spec with no source code. Three research documents evaluated strategic viability, tech stack options, and CLI-vs-MCP for agent-agnosticism. All conclusions are favorable — proceed with implementation. Before writing code, the docs must be updated to reflect research decisions: Rust as runtime, MCP deferred to post-v1.

## Decisions from Research

- **Runtime:** Rust (1–3 MB binary, ~1 ms startup, serde for JSON, Askama for templates)
- **MCP:** Deferred to post-v1. The CLI binary (`echo JSON | planview`) is already the agent-agnostic interface.
- **New CLI flags:** `--schema`, `--validate` (from cli-vs-mcp.md recommendations)

---

## Step 1: Update docs to reflect Rust decision

Update all Bun references to Rust across the documentation.

### `AGENTS.md`
- Line 10: "compiled Bun binary" → "compiled Rust binary"
- Line 35: "Runtime: Bun (build, test, compile to single binary)" → "Runtime: Rust (cargo build, cargo test, single binary via `cargo build --release`)"

### `docs/developer-guide.md`
- Line 417: "Bun compile to single binary" → "Rust compile to single binary" (Design Decisions table)
- Line 428: "mermaid.ts" → "mermaid.rs", "d2.ts" → "d2.rs" (Rendering Backend Research)
- Line 448: "Bun required: runtime, build tool, test runner, binary compiler" → "Rust required: cargo for build/test/compile, single binary via `cargo build --release`"
- Line 251: "compiled at build time from `style.css` and `script.js`" → "embedded at build time via `include_str!()` from `style.css` and `script.js`"

---

## Step 2: Update docs to reflect MCP deferral

### `docs/developer-guide.md`
- Add to CLI Interface section (after line 288), two new flags:
  - `--schema` — dump the topology JSON schema to stdout
  - `--validate` — validate JSON without rendering or opening browser (exit 0 = valid, exit 1 = invalid with errors on stderr)
- Add a "Post-v1: MCP Server" subsection under Design Decisions noting that MCP is deferred per `research/cli-vs-mcp.md`, and the CLI is the portable interface

### `research/strategic-review.md`
- Line 107 (recommendation #2): add a note that this was revised — "Revised: defer MCP to post-v1 per research/cli-vs-mcp.md. The CLI binary is already agent-agnostic."

---

## Step 3: Scaffold the Rust project

```
cargo init --name planview
```

Expected structure:
```
src/
  main.rs          # CLI entry point, argument parsing (clap)
  validate.rs      # 18 validation rules via serde + custom validators
  graph.rs         # Topological sort, step assignment
  mermaid.rs       # Mermaid graph text generation
  describe.rs      # Topology overview text generation
  html.rs          # HTML assembly (Askama templates, embedded CSS/JS)
  hook.rs          # ExitPlanMode hook processing
  types.rs         # Topology, Agent structs (serde derive)
  example.rs       # Built-in showcase topology
static/
  style.css        # Embedded via include_str!()
  script.js        # Embedded via include_str!()
templates/
  page.html        # Askama template for HTML output
Cargo.toml         # serde, serde_json, clap, askama
```

---

## Step 4: Implement types and validation (`types.rs`, `validate.rs`)

Define `Topology` and `Agent` structs with serde derive. Implement 18 validation rules from `docs/data-model.md`:

- Structural: non-null object, non-empty `task_summary`, valid `execution_mode`, non-empty `agents`
- Per-agent: ID regex `^[a-zA-Z0-9_-]+$`, required fields, enum values for `model`/`execution_mode`, optional field types
- Dependency: scope-aware `blocked_by` reference checking, no self-deps, acyclic (DFS)
- Normalization: default `output` to `"inline"`

Test with valid and invalid JSON fixtures.

---

## Step 5: Implement graph algorithms (`graph.rs`)

- Topological sort via DFS on `blocked_by` graph
- Step number assignment (no blockers = step 1, blocked by step-N = step N+1)
- Parallel agents share step numbers
- Cycle detection via recursion stack
- Scope-aware: each nesting level independent

---

## Step 6: Implement Mermaid generation (`mermaid.rs`)

Per `docs/developer-guide.md`:
- Subagents mode: one `graph TD` per step/phase, main node (double circle), agent trees, classDef for model colors
- Team mode: single `graph TD`, main node, subgraph for team boundary, blocked_by edges
- Node shapes: rectangle for inline output, stadium for file output
- ID escaping: hyphens → underscores
- Model coloring: haiku (blue), sonnet (green), opus (purple), main (amber)

---

## Step 7: Implement description generation (`describe.rs`)

Per `docs/developer-guide.md`:
- Human-readable topology overview with step numbering
- Uses topological sort grouping from `graph.rs`
- Parallel agents get letter suffixes (a, b, c)
- Output context: file paths, downstream passthrough, default return to caller

---

## Step 8: Implement HTML assembly (`html.rs`, templates/)

- Askama template for single-page HTML
- Embed `style.css` and `script.js` via `include_str!()`
- CDN refs: mermaid@11.12.2, marked@15.0.7, dompurify@3.2.4
- Two layout modes: single column (diagram only) vs two-column (plan + diagram)
- Legend: model color swatches + output shape indicators
- Client-side JS: theme toggle, PNG download, plan markdown rendering

---

## Step 9: Implement CLI (`main.rs`)

Using clap:
- `planview <file>` — render from file
- stdin detection — render from stdin
- `planview hook` — process ExitPlanMode hook
- `planview index <dir>` — generate gallery
- `--example` / `--example --json` — showcase
- `--mermaid` — raw Mermaid output
- `--plan <file>` — plan panel
- `--schema` — dump JSON schema (new)
- `--validate` — validate without rendering (new)
- `-h`, `-v`

Browser launch: `open` on macOS, `xdg-open` on Linux, `start` on Windows.

---

## Step 10: Implement hook mode (`hook.rs`)

Per `docs/developer-guide.md`:
- Parse hook input JSON (`session_id`, `tool_name`, `tool_input`)
- Read topology from `/tmp/planview-{session_id}.json`
- If missing: deny with instruction to run `/planview`, write `.attempted` marker, max 3 attempts then fall through
- If present: scan `~/.claude/plans/` for most recent `.md`, render combined plan+diagram
- Always exit 0

---

## Step 11: Built-in example (`example.rs`)

Hardcoded showcase topology demonstrating both execution modes, nested agents, blocked_by chains, background agents, file output.

---

## Step 12: End-to-end testing

- Unit tests per module (cargo test)
- Integration tests: pipe example JSON through binary, verify HTML output
- Hook mode tests: simulate hook input JSON, verify deny/allow behavior
- Validation tests: fixtures for all 18 rules (valid + invalid cases)
- Determinism test: run same input twice, diff output (must be identical)

---

## Step 13: Skill and hook configuration

- Write `SKILL.md` with skill config (`name: planview`, `context: fork`, `allowed-tools: Read, Grep, Glob, Bash`)
- Write hook config for `settings.json` (PreToolUse on ExitPlanMode → `planview hook || true`)
- Update `README.md` with installation instructions

---

## Verification

After each step:
- `cargo build` succeeds
- `cargo test` passes
- After step 9+: `echo '<example json>' | cargo run` produces correct HTML
- After step 10: `echo '<hook json>' | cargo run -- hook` exits 0 with correct behavior
- After step 12: full test suite green
- After step 13: manual test in Claude Code — enter plan mode, invoke `/planview`, exit plan mode, verify browser opens with combined view

---

## Files to modify (steps 1–2)

- `AGENTS.md` — lines 10, 35
- `docs/developer-guide.md` — lines 251, 417, 428, 448 + new sections
- `research/strategic-review.md` — line 107

## Files to create (steps 3–13)

- `Cargo.toml`
- `src/main.rs`, `types.rs`, `validate.rs`, `graph.rs`, `mermaid.rs`, `describe.rs`, `html.rs`, `hook.rs`, `example.rs`
- `static/style.css`, `static/script.js`
- `templates/page.html`
- `SKILL.md`
- Test fixtures in `tests/`
