# Unit 02 — Plan + Unit data model

**Blocked by:** 01
**Agents involved:** main only
**Topology:** none

## Goal

Introduce Plan and Unit types alongside the existing Topology type. Plan is the new top-level skill output; Topology remains as an optional per-unit field. Validation extends the existing scope-aware rules.

## Tasks

### Types

Add to `src/types.rs` (or split into `src/plan.rs` if file grows past ~500 lines):

- `Plan { task_summary: String, slug: String, units: Vec<Unit> }`
- `Unit { id: String, title: String, summary: String, blocked_by: Vec<String>, agents_involved: Option<Vec<String>>, review_steps: Vec<String>, body_markdown: String, topology: Option<Topology> }`
- Existing `Topology` and `Agent` types: unchanged at the schema level. When a Topology lives inside a Unit, the Topology's `task_summary` is informational only — the unit's `summary` is the canonical description.

Serde derive for both. JSON shape mirrors field names directly (snake_case in Rust ↔ snake_case in JSON; no rename).

### Validation

Extend `src/validate.rs`:

- `validate_plan(&Plan) -> Result<(), Vec<ValidationError>>` checks:
  - `task_summary` non-empty
  - `slug` matches `^[a-z0-9-]+$`, non-empty, ≤ 60 chars, no leading/trailing hyphen
  - `units` non-empty
  - unit `id` matches `^[0-9]{2}-[a-z0-9-]+$` (e.g. `01-housekeeping`), unique within plan
  - per-unit: `title`, `summary` non-empty
  - `blocked_by` references existing unit IDs in the same plan; no self-dep; the unit-blocked_by graph is acyclic (reuse existing DFS check from `graph.rs` at unit scope)
  - if `topology` is `Some`, run existing `validate_topology` against it (no changes to that function)
- Existing `validate_topology` stays. Called both standalone (legacy entry points if we keep them) and recursively from `validate_plan`.

### Tests

Add to `tests/validation_test.rs`:

- Minimal valid plan (one unit, no topology, empty `blocked_by`).
- Plan with sequential units (unit 02 `blocked_by: ["01"]`).
- Plan with one unit carrying a non-trivial topology (reuse a topology fixture from existing tests).
- Invalid: cycle in unit blocked_by.
- Invalid: dangling blocked_by reference.
- Invalid: malformed slug (uppercase, spaces, leading hyphen).
- Invalid: unit ID format wrong (missing prefix, wrong digit count).
- Invalid: empty `units` array.
- Invalid: duplicate unit IDs.

## Acceptance

- All new tests pass; existing tests unchanged.
- `Plan` round-trips through serde without loss.
- Validation produces clear error messages following the existing pattern (one line per error, error path included).

## Review

- [ ] Local: `/code-review:code-review`
- [ ] Agent CLI: `agent --print --model gpt-5 "<adversarial-review base prompt + diff for this unit>"` — base prompt is an open item from the dev-workflow doc; if not yet authored, run with `/codex:adversarial-review` as a stand-in
- [ ] Commit
- [ ] Update progress.md cursor → unit 03
