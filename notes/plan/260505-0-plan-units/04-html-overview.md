# Unit 04 — HTML overview rendering

**Blocked by:** 02
**Agents involved:** main only
**Topology:** none

## Goal

Produce a single `overview.html` per plan dir, sequential rendering of all units inline with embedded Mermaid blocks where present. Auto-open browser per existing behavior (gated by `PLANVIEW_NO_OPEN` as today; gated additionally by config in unit 07).

## Tasks

### New rendering function

Extend `src/html.rs`:

- `render_plan_html(plan: &Plan) -> String`
  - Title: `Plan: {plan.task_summary}` (truncate if long; `plan.slug` is the fallback).
  - Header section: task summary + decisions block. Decisions are not in the schema explicitly — they live in the rendered `overview.md`. v1 simplification: have the HTML include the rendered `overview.md` markdown (via `marked`) as the header section.
  - Per-unit cards: title (anchor link), summary, blocked-by chips, review checklist (from `review_steps`), body_markdown rendered via marked, optional mermaid block.
  - Reuse existing `style.css`, `script.js` infrastructure. Extend stylesheet for unit cards (add to `static/style.css`, do not fork).
  - Reuse existing CDN deps: `mermaid@11.x`, `marked@15.x`, `dompurify@3.x`. No new deps.

### Output path

- Write to `<plan-dir>/overview.html` (no longer `/tmp`).
- Browser-open: when invoked from materialize flow, open the file unless `PLANVIEW_NO_OPEN` is set (existing env var). Config flag in unit 07 supersedes.

### Tests

Extend `tests/html_test.rs` (or create one):

- Fixture plan → HTML string contains expected unit titles, mermaid blocks, decisions section.
- Substring assertions over full HTML snapshot — exact-match snapshots are brittle for HTML.
- Confirm CSS/JS are inlined (no external file references besides CDN).

## Acceptance

- Generated `overview.html` opens cleanly in a browser; mermaid renders for fixture plans with topology; navigation via anchor links works.
- Visual parity with existing topology HTML for components that reappear (theme toggle, model color swatches in mermaid).

## Review

- [ ] Local: `/code-review:code-review`
- [ ] Manual smoke: open the generated HTML in Chrome + Safari; toggle theme; check mermaid renders for a fixture with topology
- [ ] Commit
- [ ] Update progress.md cursor → unit 05
