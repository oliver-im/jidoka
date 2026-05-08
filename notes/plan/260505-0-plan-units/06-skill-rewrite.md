# Unit 06 — Skill rewrite + agent-guide

**Blocked by:** 02
**Agents involved:** main only
**Topology:** none

## Goal

Update the skill to emit Plan JSON instead of Topology JSON, with heuristics for unit splitting, per-unit topology emission, slug derivation, and review-step assignment. Update `docs/agent-guide.md` and `docs/data-model.md`. Plugin manifest auto-loads the skill (research finding: plugin manifest IS a prompt-injection vector).

## Tasks

### Skill prompt rewrite

Locate the skill definition (likely `SKILL.md` at repo root or in a `skills/` dir; confirm during unit start). Rewrite the prompt:

- Target output: Plan JSON (per the schema locked in unit 02).
- Heuristics:
  - **Unit splitting:** each unit must be (a) reviewable on its own, (b) finishable in one session including reviews. No fixed line/time budget. Most plans land at 3–7 units.
  - **Topology decision:** emit `topology: null` by default. Only include a topology when a unit dispatches more than one agent with meaningful structure (parallel review, distinct roles). Single-agent units never carry topology.
  - **Slug:** kebab-case, ≤ 60 chars, derived from the task summary. Skill picks; no user input.
  - **blocked_by (units):** sequential by default (`["01"]`, `["02"]`, …). Only deviate when there's a real reason for non-linear ordering.
  - **review_steps:** default `["/code-review:code-review"]`. Add `"agent-cli"` for foundational/risky units (data model, hook integration, anything that breaks builds). Skill makes the call; user can override post-hoc by editing the unit md.
- Re-state hard rules (unchanged): one-shot, no AskUserQuestion in fork, regenerate full Plan on adjustment, never execute, never call the renderer.

### Update `docs/data-model.md`

- Add Plan + Unit schema sections (mirroring the Topology section style).
- Reframe the Topology section as "per-unit, optional".
- Add a "Plan vs Topology" framing paragraph at the top.

### Update `docs/agent-guide.md`

- Update the "Process" section: skill produces Plan, saves to `/tmp/planview-{session_id}.json`, returns.
- Update "Skill Configuration" if needed (`context: fork` stays).
- Heuristics section: add unit-splitting, topology-decision, slug, review-steps subsections with concrete examples.

### Plugin manifest

- Locate `.claude-plugin/plugin.json` (or wherever the manifest lives in this repo). Confirm it's set up to auto-load the skill so the install IS the prompt-injection (per research). If incomplete, scaffold it.
- The skill's frontmatter description doubles as a system-prompt fragment that Claude sees when planning. Make it explicit: e.g., `"When in plan mode, structure your plan with explicit unit boundaries (## Unit N: <title>)."`

### Update `docs/developer-guide.md`

- Architecture section: update the diagram to show Plan flow (plan dir, not /tmp browser-open) as primary; Topology as a per-unit artifact.
- Validation rules section: append Plan-level rules.
- CLI Interface section: any new flags (e.g., `planview materialize <file>`).

## Acceptance

- Skill produces valid Plan JSON for a representative task (manual smoke: pick a real planning prompt, run /planview, inspect output).
- All three docs (data-model, agent-guide, developer-guide) cross-reference correctly.
- Plugin manifest auto-loads the skill in a fresh project (confirm by enabling planview in another repo).

## Review

- [ ] Local: `/code-review:code-review` — prose review, focus on heuristic clarity and hard-rule completeness
- [ ] Manual smoke: invoke /planview on three distinct task types (small bug fix, multi-file feature, parallel-review-heavy plan); inspect Plan JSON for sanity
- [ ] Commit
- [ ] Update progress.md cursor → unit 07
