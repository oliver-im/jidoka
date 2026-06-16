# Unit 04 — Update the jidoka skill contract
**Blocked by:** 03-retire-the-asset-generation-build-step**Agents involved:** main only**Topology:** none
## Summary

Update the runtime-facing skill contract so it no longer instructs the planner to emit topology fences, and the setup questionnaire no longer writes the removed config flags. This governs what future plans look like.

### Tasks
- `skills/jidoka/SKILL.md`: remove the "Per-unit topology fence" section, the "Topology shape" section, the "Topology decision" heuristic, the "Why a per-unit topology fence, not a plan-level one" design constraint, and the topology sentence in the intro ("A unit may carry an optional topology fence …"). Keep the unit-decomposition framing, the markdown shape, the remaining heuristics (unit splitting, slug, unit IDs / blocked_by, review_steps, reference-don't-paste, promoting-an-idea), and the contract section.
- `skills/setup/SKILL.md`: remove the `auto_open_browser`, `html_output`, and `plan_level_topology` rows from the key table; remove their keys + explanatory comments from the JSONC "Template to write"; remove the `auto_open_browser` and `html_output` questionnaire questions from the Process steps; update "all eight top-level keys" to the correct count (five) and adjust the auto-populated-keys list.
- `skills/pre-plan-review/SKILL.md`: drop the now-dead topology review guidance — the "Topology mismatch" attack-surface bullet, the topology-fence detection step in the review method ("If a `topology` fence is rendered…"), and the "focus on the topology decisions" example in the user-focus note. (`skills/plan-review-prompt/` is already topology-free — leave it.)

### Acceptance
- All three affected skill docs (`jidoka`, `setup`, `pre-plan-review`) describe only the markdown-units + review-pipeline contract; no topology / HTML / browser guidance remains.
- The setup template and the stated key count are internally consistent (five keys: `plan_dir_root`, `git_workflow`, `pre_review`, `unit_review`, `plan_review`).

### Notes
- Docs follow the code (Units 01–03) on purpose: the renderer is the source of truth, so the contract is rewritten once topology is actually gone.
- Do not touch `docs/CONVENTION.md` (portable, rendering-agnostic).

## Review pipeline

- [ ] `/code-review`
- [ ] `codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.'` — **exec**: the resuming agent runs this via the Bash tool, then surfaces the findings

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
---
See `progress.md` for the cursor and overall plan state.
