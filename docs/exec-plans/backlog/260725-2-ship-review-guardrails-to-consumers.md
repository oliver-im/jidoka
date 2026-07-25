# 260725-2-ship-review-guardrails-to-consumers — Get the review preconditions into the plugin bundle, and close the renderer gaps the exec default now exercises

Candidate work. Surfaced by the `/code-review max` pass over `feat/unit-review-invocability`
and deliberately scoped out of that branch, which was a config-default change. Rationale in
`docs/discussions/review-pipeline.md` (§`/code-review` went operator-run).

## 1. None of the guardrails ship (the altitude problem)

`unit_review` now ships `mode: "exec"` with a `{diff_range}` the consumer must substitute, and
`/code-review` **fails open** on a range that is empty or unresolvable — it reviews the most
recent commit and returns confident findings about unrelated code, indistinguishable from a
clean pass. Every guardrail for that lives in `docs/exec-plans/AGENTS.md`, which is jidoka's
own dogfooding doc and is **not** part of the plugin:

```bash
grep -rl "git diff --quiet" dist/ templates/ skills/ hooks/ .claude-plugin/   # → nothing
```

So a consumer installs jidoka, gets the fragile default, and has no shipped way to learn the
preconditions. The repo already solved this exact problem once: `scripts/build.mjs` defines
`__JIDOKA_CONVENTION__` from `docs/CONVENTION.md` and `ts/cli.ts` prints it via
`jidoka convention`, described as the way "consuming repos read this instead of vendoring a
CONVENTION.md copy that silently drifts." The review preconditions want the same treatment —
embedded at build, surfaced by a command, and rendered (or linked) into `progress.md`.

Decide the surface: extend `jidoka convention`, add a sibling command, or render the
preconditions directly into each Unit md's review section.

## 2. `{base}` has no referent with `git_workflow: false`

`git_workflow` ships **false**, so the worktree-per-plan / branch-per-unit topology that gives
`{base}` its unit-stage meaning does not exist for a default consumer. `ts/types.ts` and
`docs/data-model.md` now say to resolve it to "the commit the unit's work started from", but
nothing *computes* or *records* that boundary — the resuming agent has to have noticed it
before the unit began. Either record the unit's start commit at materialize/resume time, or
have the composer (`260725-0`) derive it.

## 3. `overviewReviewsCell` doesn't fence its cell content

`ts/render-md.ts:overviewReviewsCell` escapes `|` but does not wrap the step label in a code
span, unlike `renderStepItem`, which routes the same content through `mdInlineCode` precisely
because a `run` can contain a backtick and would otherwise close the span early
(`templates/overview.md.eta` is a bare `<%= it.unitRows %>` and eta runs with
`autoEscape: false`, so nothing downstream compensates). Today's shipped default has no
backtick, so this is latent — but the docs advise hand-editing templates, and a template using
`` `git merge-base …` `` corrupts the Unit table. Existing backtick tests cover `buildUnitMd`
only, not the overview cell.

## 4. Nothing catches an unsubstituted placeholder before an `exec` step runs

The renderer records `{diff_range}` verbatim by design and the resume protocol asks a
human-or-agent to substitute it; `mode: "exec"` then hands the string to Bash unattended. If
substitution is skipped, `claude -p '/code-review {diff_range}' < /dev/null` runs with the
placeholder intact — straight into the fail-open path, gate passed, wrong code reviewed. A
cheap guard exists: refuse to run a step whose `run` still matches a `REVIEW_PLACEHOLDERS`
entry. Note the renderer never executes anything, so this belongs to the layer that does (the
resume protocol as a hard check, or the composer in `260725-0`).

## 5. The same four facts are restated in nine places

*`/code-review` is operator-run → reach it via `claude -p`; `{diff_range}` is mandatory because
the command fails open; `{base}` is stage-scoped; substitute a resolved SHA* now appear in
`ts/config.ts`, `ts/types.ts`, `skills/setup/SKILL.md` (twice), `docs/data-model.md`,
`docs/developer-guide.md`, `docs/agent-guide.md`, `README.md`, and `docs/exec-plans/AGENTS.md`.
Drift has already started within a single branch ("120s" vs "120 s"; "verified on 2.1.220" vs
"not re-verified here" — the latter needed a correction pass).

`docs/data-model.md` §Command semantics & invocation is already the canonical site and is
already linked by anchor from `developer-guide.md`; the rest should shrink to pointers. The
worst copy is `skills/setup/SKILL.md`'s ~20-line comment block, which is **copy-pasted into
every user's `config.json`** and can never be updated afterwards — when `260725-0` supersedes
this default, those files still explain the old one. Consider whether the shipped template
should carry a pointer instead of an essay.

## References

- `docs/discussions/review-pipeline.md` — the decision this work falls out of
- `scripts/build.mjs` (`__JIDOKA_CONVENTION__`), `ts/cli.ts` (`convention` subcommand) — the
  precedent for shipping doc text with the bundle
- `ts/render-md.ts` (`overviewReviewsCell`, `renderStepItem`, `mdInlineCode`)
- `ts/types.ts` (`REVIEW_PLACEHOLDERS`)
