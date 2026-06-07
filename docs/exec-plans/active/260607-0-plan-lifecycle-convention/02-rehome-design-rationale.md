# Unit 02 — Re-home design rationale + fix doc links

**Blocked by:** 01
**Agents involved:** main only
**Topology:** none

## Summary

Sort the surviving research into its correct kind: settled decisions → `design-docs/`, the reversed decision → `superseded/` (stamped), still-open exploration → `ideas/`. Build the `design-docs/index.md` catalog, fix the two inbound links from `developer-guide.md`, and retire the legacy top-level `research/`.

### Tasks

- Clear settled decisions → `docs/design-docs/` (use `git mv` to preserve history):
  - `research/cli-vs-mcp.md` → `cli-over-mcp.md`
  - `research/diagram-rendering.md` → `mermaid-rendering.md`
  - `notes/research/260605-0-review-pipeline-direction.md` → `review-pipeline.md` (has a Decisions section — it's a decision record)
- Triage-then-move the rest by the three-kind test (settled → `design-docs/`; reversed → `superseded/`; still-open → `ideas/`; pure history → leave in git): `research/{strategic-review,skill-distribution,googleworkspace-cli,browser-debugging}.md`, `notes/research/260514-0-codex-adversarial-review.md`. Surface the per-file call before moving.
- Reversed decision: `research/tech-stack.md` → `docs/design-docs/superseded/rust-runtime.md` (topic-named like all design-docs; the date lives in the stamp, not the filename); prepend a provenance stamp (`STATUS: superseded · chose Rust here (Mar 2026), later moved to TypeScript · kept as record`).
- Fix links in `docs/developer-guide.md` (~lines 507, 511): `../research/cli-vs-mcp.md` → `../design-docs/cli-over-mcp.md`; `../research/diagram-rendering.md` → `../design-docs/mermaid-rendering.md`.
- Write `docs/design-docs/index.md`: catalog each decision with a one-line summary + status (active / superseded).
- Remove the now-empty top-level `research/` (including its `AGENTS.md` / `CLAUDE.md`).

### Acceptance

- `rg -n 'research/' docs/ README.md AGENTS.md` shows no stale links (the two developer-guide links updated; no other inbound refs).
- Every moved file sits in the correct kind; `superseded/rust-runtime.md` carries the stamp.
- `docs/design-docs/index.md` lists every decision doc with a status.
- Top-level `research/` no longer exists.

### Notes

- Apply "reference, don't paste": design-docs capture rationale; if a doc pastes code that's since drifted, trim it to a `path:symbol` reference.
- The two `developer-guide.md` links are the only inbound references found in the kept surface (verified before the Unit-01 cleanup) — don't assume others without re-grepping.
