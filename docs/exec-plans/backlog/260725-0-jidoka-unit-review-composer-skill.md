# 260725-0-jidoka-unit-review-composer-skill — Add a jidoka:unit-review composer that computes the unit's review scope and drives the configured vehicle

Candidate work. Rationale lives in `docs/discussions/review-pipeline.md`
(§`/code-review` went operator-run → *Why not the alternatives*), where this is recorded as
**deferred, not rejected**.

## Why

`unit_review` currently ships as a static config template
(`claude -p '/code-review {diff_range}' < /dev/null`, `mode: "exec"`). Every defect found in
the two commits that introduced it was the same shape: **a static string cannot branch.** It
cannot check that a range resolves, distinguish "empty" from "unresolvable", keep a committed
build artifact out of scope, choose its own timeout, or retry. Each of those became a
paragraph of resume-protocol prose telling a human-or-agent to do it by hand — which is
exactly the kind of instruction that goes unread and unenforced.

A composer skill can *compute* what the template can only *state*.

## What

A bundled `skills/unit-review/SKILL.md`, agent-invocable, **symmetric with the existing
`/jidoka:plan-review-prompt`** (same pattern: the skill aims and drives; the configured entry
stays the vehicle). Per unit it would:

- derive the range against the **plan branch** (not `main` — see the `{base}` stage-scoping
  fix in `ts/types.ts`), and resolve it to a literal ref
- verify the range resolves and is non-empty, distinguishing `git diff --quiet` exit 1 from
  exit ≥ 2, and stop rather than fail open
- keep committed build artifacts (`dist/cli.js`) out of the reviewed scope
- run the vehicle with a timeout suited to a multi-minute review
- **inject the unit's acceptance criteria into the review** — the one gap the `claude -p`
  form cannot close at all, since non-`ultra` `/code-review` parses trailing text as the
  review *target* and has no note slot

## Not in scope

**It drives the vehicle; it does not become the reviewer.** Decision #2 stands — the built-in
`/code-review` stays the unit reviewer. A skill that reviewed the diff with its own prompt
would trade away the built-in's multi-agent pipeline and verification stage, which is the
thing that makes it worth reaching for in the first place.

## References

- `docs/discussions/review-pipeline.md` — the decision and its alternatives
- `skills/plan-review-prompt/SKILL.md` — the pattern to mirror
- `docs/exec-plans/AGENTS.md` (Resume protocol) — the by-hand preconditions this would absorb
- `ts/config.ts` (`defaultConfig.unit_review`), `ts/types.ts` (`REVIEW_PLACEHOLDERS`)
