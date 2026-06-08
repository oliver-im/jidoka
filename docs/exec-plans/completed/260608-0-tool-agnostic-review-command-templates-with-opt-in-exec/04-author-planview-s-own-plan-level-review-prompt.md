# Unit 04 — Author planview's own plan-level review prompt
**Blocked by:** 03-record-render-the-template-form-and-its-mode**Agents involved:** main only**Topology:** none
## Summary

Write a self-contained, hostile plan-level review prompt that planview owns — the prompt fed to a generic model (`codex exec`, cursor-agent) — structurally analogous to `skills/pre-plan-review/SKILL.md` but aimed at a committed diff rather than plan markdown.

Tasks:
- Create the prompt asset (co-located with the composer, e.g. `skills/plan-review-prompt/plan-review.prompt.md`). It instructs a reviewer to attack the **cumulative committed diff as one integrated change**: cross-unit consistency / integration seams; confirm each *deferred forward-reference* got wired up; invariants/contracts spanning units; riskiest / most-coupled / largest changes; coverage gaps (claimed-X vs delivered-X incl. tests/docs/wiring).
- Mirror `pre-plan-review`'s structure (operating stance, attack surface, finding bar, severities, grounding, calibration, final check) but for a diff. Output contract: findings with file + line range + severity + concrete fix, and a terse ship/no-ship summary. The prompt assumes the diff is handed to it (no Bash/tools inside the prompt).
- It is explicitly **not** a copy of codex's `adversarial-review.md`.

Acceptance: a standalone prompt file exists; a model given (diff + this prompt) could review with no other context; it targets cross-unit / forward-reference risk; it is not vendored from codex.
Note (forward-reference): this asset is injected by the composer in Unit 05; until then it is intentionally unreferenced. It is also independent of Units 02–03 (a standalone prose asset gated only by the Unit 01 decision) — the sequential `blocked_by` is execution order, not a real dependency, so it can be reordered or done in parallel.

## Review pipeline

- [ ] `/code-review`
---
See `progress.md` for the cursor and overall plan state.
