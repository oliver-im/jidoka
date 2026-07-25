# 260725-0-jidoka-unit-review-composer-skill — Add a jidoka:unit-review composer that computes the unit's review scope and drives the configured vehicle

Candidate work. Rationale lives in `docs/discussions/review-pipeline.md`
(§`/code-review` went operator-run → *Why not the alternatives*), where this is recorded as
**deferred, not rejected**.

## Why

`unit_review` currently ships as a static config template
(`claude -p '/code-review {diff_range}' < /dev/null`, `mode: "exec"`). Several of the defects
found in the commits that introduced it share one shape: **a static string cannot branch.** It
cannot check that a range resolves, distinguish "no commits" from "empty net diff", or escape
a substituted ref. Each became a paragraph of resume-protocol prose telling a human-or-agent
to do it by hand — the kind of instruction that goes unread and unenforced.

Not every defect was that shape, and the case shouldn't be overstated: the Bash 120 s timeout
is **pre-existing** (the shipped `plan_review` drives `codex exec` and is equally
long-running), so a unit-scoped composer would not cure it. The build-artifact ordering rule
that was originally cited here has been **retracted outright** — the measurement behind it was
wrong (see the discussion doc). What survives is still enough: a composer can *compute* what
the template can only *state*.

## What

A bundled `skills/unit-review/SKILL.md`, agent-invocable, **symmetric with the existing
`/jidoka:plan-review-prompt`** (same pattern: the skill aims and drives; the configured entry
stays the vehicle). Per unit it would:

- derive the range against the ref the unit's work forked from — the **plan branch** under the
  git workflow, and with `git_workflow` off (the shipped default) the unit's own start commit;
  never `main`, which widens the review to Units 01..NN
- resolve that ref to a **SHA** before interpolation. The vehicle single-quotes its prompt and
  nothing escapes the substitution, while git permits `'`, `$(…)`, `;` and `|` in ref names —
  so passing a branch name through is a quote-breaking substitution, not a cosmetic choice
- verify the range resolves (`git rev-parse --verify`) and carries commits
  (`git rev-list --count`, **not** `git diff --quiet`, which reports a commit and its revert as
  empty), and stop rather than fail open
- run the vehicle with a timeout suited to a multi-minute review
- **inject the unit's acceptance criteria into the review** — the one gap the `claude -p`
  form cannot close at all, since non-`ultra` `/code-review` parses trailing text as the
  review *target* and has no note slot

## Design constraints to settle first

- **Self-reference guard.** `plan-review-prompt` drops any `plan_review` entry equal to itself
  before driving the rest (`skills/plan-review-prompt/SKILL.md:32`), because a config naming
  the composer as its own vehicle recurses. A unit-stage composer needs the same guard, or the
  natural configuration `unit_review: ["/jidoka:unit-review"]` loops.
- **How it gets invoked.** The plan stage has a protocol hook: the resume protocol names
  `/jidoka:plan-review-prompt` explicitly at the plan gate. The unit stage has none — the
  resuming agent runs whatever `unit_review` holds. Either the composer becomes a configurable
  entry (and needs the guard above) or the resume protocol gains a unit-stage hook; that
  protocol edit is in scope for this item and should not be discovered mid-implementation.

## Not in scope

**It drives the vehicle; it does not become the reviewer.** Decision #2 stands — the built-in
`/code-review` stays the unit reviewer. A skill that reviewed the diff with its own prompt
would trade away the built-in's multi-agent pipeline and verification stage, which is the
thing that makes it worth reaching for in the first place.

## References

- `docs/discussions/review-pipeline.md` — the decision, its alternatives, and the retraction
- `skills/plan-review-prompt/SKILL.md` — the pattern to mirror (and its self-reference guard)
- `docs/exec-plans/AGENTS.md` (Resume protocol) — the by-hand preconditions this would absorb
- `ts/config.ts` (`defaultConfig.unit_review`), `ts/types.ts` (`REVIEW_PLACEHOLDERS`)
