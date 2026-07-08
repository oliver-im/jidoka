# 260709-0-add-opt-in-re-review-to-convergence-to-the-review-pipeline — Add opt-in re-review-to-convergence to the review pipeline
## Goal

Add opt-in re-review-to-convergence to the review pipeline.
## Context

_Why-now and the context that motivated this plan._

## Decisions (locked, v1)

_Lock decisions here so units don't have to re-litigate them._

## Out of scope (v1)

_Items deferred or explicitly not addressed._

## Unit list

| # | Title | Blocked by | Reviews |
|---|---|---|---|
| 01 | Add the `review_reconverge` config toggle and render the unit-review convergence note | — | /code-review + codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.' |
| 02 | Render the convergence note in the plan-level review block | 01 | /code-review + codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.' |
| 03 | Document the toggle and mark the discussion doc realized | 02 | /code-review + codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.' |
## Cross-cutting constraints

_Conventions, invariants, etc._

## References

_Linked docs and external context._
