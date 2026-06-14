# Unit 01 — Pin the design in review-pipeline.md
**Blocked by:** none**Agents involved:** main only**Topology:** none
## Summary

Append a superseding decision block to `docs/design-docs/review-pipeline.md` so the design is recorded before any code moves. Design-only, no code.

Tasks:
- Add a dated decision section "Generalize review steps to tool-agnostic templates" that captures the three settled decisions: (1) relax `reviewCommandSchema` to accept a slash command **or** a bash template; (2) jidoka authors its own plan-level review prompt rather than vendoring codex's (codex's is diff/code-shaped, generic, drifts on upstream change, and redistributes someone else's text — with `codex exec`, codex supplies only the *model*, jidoka the *prompt*); (3) `print` default / `exec` opt-in, with rationale (the human checkpoint at the last lifecycle gate + the cost profile of a full-diff adversarial review; the Bash bypass is legitimate because `disable-model-invocation` blocks only the SlashCommand route, not Bash).
- Add a fourth decision: the operator-vs-agent (print/exec) axis spans **all three** review stages, not just `plan_review`. Concretely, flip `pre-plan-review` from operator-run (`disable-model-invocation: true`) to **agent-invocable + auto-run-then-stop** — on first session the resume agent runs the `pre_review` step automatically, surfaces findings, and **stops before Unit 01** (surface, don't auto-revise). Rationale: pre-plan-review is cheap, read-only, and produces *findings* (not a command, not edits), so the cost/guardrail reasons that keep *codex* review operator-run don't apply; and the same "cheap, no external call, we want the agent to do it" logic that already made the `plan-review-prompt` composer agent-invocable applies at least as strongly here. Auto-*invoke* ≠ auto-*apply*: the human checkpoint is preserved by reading the findings and deciding. This *further refines* #6 — its "operator-run is the norm" framing is reversed for cheap local reviews, while expensive/external reviews (codex) stay `print`-default + operator-run.
- Clarify the **two-mechanism invocation model** (so Units 02/03/05 don't diverge): `mode: print|exec` is a **template-only** field; for **slash-command** steps, operator-vs-agent is governed by the target skill's `disable-model-invocation` (agent-invocable when absent, operator-run when present). "Axis spans all three stages" is realized by *both* mechanisms, not by `mode` alone. Placeholders are **stage-scoped** — `pre_review` runs before any unit, so only `{plan_dir}` is valid there; `{base}`/`{diff_range}`/`{focus}` apply to `unit_review`/`plan_review`.
- Record the two boundaries (renderer-only-records / hook-exit-0; review steps global-config-only as a shell-exec security boundary).
- Explicitly mark decision #6 superseded and #5 refined. Clarify this is **not** forking codex — it bypasses the codex *plugin* via a generic template, which #6 itself named as escape hatch (a). Cross-reference `codex-adversarial-review.md`.

Acceptance: the decision block exists, names #6 as superseded / #5 as refined, records the all-stages print/exec axis **and** the `pre-plan-review` auto-run-then-stop decision, states both boundaries, and changes no code.
Note (forward-reference): the schema shape this section describes is implemented in Unit 02.

## Review pipeline

- [ ] `/code-review`
---
See `progress.md` for the cursor and overall plan state.
