# planview: Implementation Progress

| Step | Description | Status |
|------|-------------|--------|
| 1 | Update docs to reflect Rust decision | Done |
| 2 | Update docs to reflect MCP deferral | Done |
| 3 | Scaffold the Rust project | Done |
| 4 | Implement types and validation | Done |
| 5 | Implement graph algorithms | Done |
| 6 | Implement Mermaid generation | Done |
| 7 | Implement description generation | Done |
| 8 | Implement HTML assembly | Done |
| 9 | Implement CLI | Done |
| 10 | Implement hook mode | Done |
| 11 | Built-in example | Done |
| 12 | End-to-end testing | Done |
| 13 | Skill and hook configuration | Done |

## Step 1: Update docs to reflect Rust decision

**Files modified:**
- `AGENTS.md` — "compiled Bun binary" → "compiled Rust binary", runtime line updated
- `docs/developer-guide.md` — Design Decisions table, platform constraints, CSS/JS embedding method (`include_str!()`)

Note: Rendering Backend section already had `.rs` extensions (`mermaid.rs`, `graphviz.rs`) — no change needed there.

## Step 2: Update docs to reflect MCP deferral

**Files modified:**
- `docs/developer-guide.md` — added `--schema` and `--validate` CLI flags, added "Post-v1: MCP Server" subsection under Design Decisions
- `research/strategic-review.md` — recommendation #2 struck through with revision note referencing cli-vs-mcp.md

## Step 5: Implement graph algorithms

**File modified:**
- `src/graph.rs` — `StepPlan` struct with `BTreeMap<usize, Vec<&Agent>>`, `assign_steps()` (memoized DFS), `group_by_step()` (primary entry point), 10 tests covering linear chains, diamonds, parallel agents, asymmetric merges, and order preservation.

## Step 6: Implement Mermaid generation

**Files modified:**
- `src/mermaid.rs` — `generate(&Topology) -> Vec<String>` (one graph per phase for subagents, single graph for team). Helpers: `escape_id`, `node_def`, `render_agent_tree` (recursive), `generate_subagents`/`generate_team`. Node shapes (rectangle/stadium), model coloring (classDef), ID escaping (hyphens→underscores), team subgraph wrapper, nested agent tree rendering. 17 unit tests.

**Files created:**
- `tests/mermaid_test.rs` — 3 integration tests using fixture files (minimal, nested, team).

## Step 7: Implement description generation

**File modified:**
- `src/describe.rs` — `generate(&Topology) -> String` with recursive `render()`. Phase headers (subagents multi-step only) with step reset, letter suffixes for parallel agents, 3 output context variants (writes/passes/returns), nested agent indentation, scope-aware dependent lookup. Helpers: `model_name`, `find_dependents`. 21 tests (17 unit + 3 fixture-based + 1 format check).

## Step 8: Implement HTML assembly

**Files modified:**
- `src/html.rs` — `generate(&Topology, &[String], &str, Option<&str>) -> String` using Askama template with `escape = "none"`. Manual HTML escaping for user-facing strings. Helpers: `html_escape`, `build_mode_label` (detects combined modes like "subagents + team"), `build_phase_labels`. Plan markdown JSON-encoded via `serde_json::to_string()` for client-side rendering. CSS/JS embedded via `include_str!()`. 16 tests (14 unit + 2 fixture integration).
- `templates/page.html` — Askama template with conditional plan panel, phase labels, legend (model swatches + output shapes), CDN refs (mermaid@11.12.2, marked@15.0.7, dompurify@3.2.4).
- `static/style.css` — Light/dark theme via CSS custom properties on `[data-theme]`. Two layout modes: single column (no plan) and two-column flexbox (with plan). Legend swatches match mermaid.rs classDef colors. Responsive breakpoint at 768px.
- `static/script.js` — IIFE with 5 init functions: `restoreTheme` (localStorage before mermaid init), `preserveMermaidSource` (data-source attrs), `initMermaid`, `initThemeToggle` (with mermaid re-render), `initPngDownload` (SVG→canvas→PNG at 2x), `initPlanRendering` (marked + DOMPurify).

## Step 9: Implement CLI

**Files modified:**
- `src/main.rs` — Full CLI entry point using clap 4 derive. Hybrid subcommand (`hook`, `index`) + flags (`--mermaid`, `--plan`, `--schema`, `--validate`, `--example`, `--json`, `-v`). Stdin detection via `std::io::IsTerminal`. Pipeline: read input → parse JSON → validate → generate mermaid/description/HTML → write temp file → open browser. Cross-platform browser launch (`open`/`xdg-open`/`cmd /C start`). Hardcoded JSON Schema via `serde_json::json!()`. Index mode: scans directory for `*.json`, skips invalid files with warnings, renders valid topologies to HTML, generates `index.html` gallery with iframe previews.
- `src/hook.rs` — Stub updated from comment to `pub fn run() -> Result<(), String>` returning `Ok(())` (must always exit 0).
- `src/example.rs` — Stub updated from comment to `pub fn showcase() -> Topology` with `todo!()` (Step 11 implements).

## Step 10: Implement hook mode

**Files created:**
- `src/output.rs` — Shared output utilities extracted from `main.rs`: `write_temp_html(html)`, `write_temp_html_in(html, tmpdir)`, `open_browser(path)`. Cross-platform browser launch.

**Files modified:**
- `src/hook.rs` — Full implementation replacing stub. `HookInput` struct (serde), `Config` struct with `from_env()` (hardcoded `/tmp` for topology/marker paths to match skill contract). `run()` → `run_inner()` → `run_with_input()` layering for exit-0 safety and testability. `render_topology()` reads topology, validates, generates mermaid/description, scans plans dir, renders HTML, opens browser. `handle_missing_topology()` emits deny JSON with 3-attempt marker. `scan_plans_dir()` finds most recent `.md`. `is_valid_session_id()` prevents path traversal. 20 unit tests.
- `src/main.rs` — Removed local `write_temp_html()`/`open_browser()`, replaced 4 call sites with `planview::output::*`.
- `src/lib.rs` — Added `pub mod output;`.

**Key design decisions:**
- Uses `/tmp` (not `$TMPDIR`) for topology/marker paths — the skill writes to `/tmp/planview-{session_id}.json`, and on macOS `$TMPDIR` resolves to `/var/folders/...` which would cause a mismatch.
- Config struct pattern avoids `unsafe` `std::env::set_var` in Rust 2024 edition tests.
- `write_temp_html_in(html, tmpdir)` parameterized variant added so hook can write HTML output to its own tmpdir.

## Step 11: Built-in example

**Files modified:**
- `src/example.rs` — Replaced `todo!()` with full showcase topology: "Build and deploy a full-stack dashboard feature". 7 top-level agents + 2 nested, demonstrating all features: both execution modes (top-level subagents, nested team), all 3 models, blocked_by chains (3 phases), parallel agents, background task, inline + file output, produces field, scope-aware nested dependencies. 4 unit tests (validity, mermaid generation, description, JSON roundtrip).

## Step 12: End-to-end testing

**Files created:**
- `tests/fixtures/invalid_empty_task_summary.json` — EmptyTaskSummary rule
- `tests/fixtures/invalid_empty_role.json` — EmptyRole rule
- `tests/fixtures/invalid_self_dep.json` — SelfDependency rule
- `tests/fixtures/invalid_blocked_by_not_found.json` — BlockedByNotFound rule
- `tests/fixtures/invalid_empty_nested_agents.json` — EmptyNestedAgents rule
- `tests/cli_test.rs` — 12 binary-level CLI tests: file arg, stdin, --mermaid, --validate (valid + invalid), --schema, -v, --example, --example --json, example JSON piped back through renderer, invalid input, empty input.
- `tests/determinism_test.rs` — 3 tests proving mermaid, HTML, and description generation are deterministic for same input.
- `tests/showcase_test.rs` — 2 tests: full pipeline and JSON roundtrip pipeline.

**Files modified:**
- `tests/validation_test.rs` — Added 5 fixture tests (empty_task_summary, empty_role, self_dep, blocked_by_not_found, empty_nested_agents). Every `ValidationError` variant now has a dedicated fixture file.

**Test totals:** 161 tests (126 unit + 35 integration), all passing.

## Step 13: Skill and hook configuration

**Files created:**
- `.claude/skills/planview/SKILL.md` — Skill definition with frontmatter (name, description, allowed-tools) and inlined instructions from agent-guide.md + data-model.md (process, data model, execution modes, heuristics, hard rules, design constraints)
- `.claude/settings.json` — PreToolUse hook on ExitPlanMode → `planview hook || true`

**Files modified:**
- `README.md` — Added Installation section (build, PATH setup, verify, hook setup, environment variables)
