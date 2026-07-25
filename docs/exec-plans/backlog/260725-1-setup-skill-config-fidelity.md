# 260725-1-setup-skill-config-fidelity — Make jidoka:setup faithful to config.ts: stop clobbering hand-edited config, honor reference_dir, and guard the template against drift

Candidate work. Surfaced by two independent `/code-review` passes over `9981c7f` while working
on the `unit_review` invocability change; deliberately left out of that branch so the review
fix stayed legible. All four are pre-existing.

## 1. Re-running setup discards hand-edited config all-or-nothing

`skills/setup/SKILL.md` mandates writing all top-level keys from a static template, and Process
step 1 offers overwrite-or-keep plus a "point them at the file" escape hatch. A user who
follows the documented customization route — hand-editing
`~/.claude/plugins/jidoka/config.json` to set, say, `unit_review: ["/code-review", "/simplify"]`
and `review_reconverge: false` — loses both, plus any manually added keys, if they choose
overwrite.

Not *silent*: step 1 does display the existing file and ask. The defect is narrower and still
real — the choice is **all-or-nothing with no diff of what would be lost**, and the only
"surgical" branch is "go edit it yourself by hand", which is not a merge.

`ts/config.ts:mergeForWrite` encodes precisely the right invariant ("known keys re-emitted,
manually added keys preserved") and is covered by tests, but **grep shows no caller outside
`ts/__tests__/`** — `ts/cli.ts` exposes only `hook`/`materialize`/`paths`/`convention`, and the
setup skill edits the file directly. So the guard exists, is tested, and is unreachable.

**Prerequisite before choosing the fix:** `mergeForWrite` returns a plain
`Record<string, unknown>`, emittable only via `JSON.stringify` — which destroys comments. The
same SKILL.md requires the inline JSONC comments ("The comments are part of the file —
preserve them verbatim"), and `config.ts` has no comment-preserving reader (`readJson` runs
`stripJsonComments` *before* parsing). So a naive `jidoka config write` subcommand would trade
losing hand-edited values for losing ~60 lines of schema documentation. Either add
comment-preserving round-trip first, or have the skill merge in place.

## 2. The `reference_dir` answer is dropped on write

The questionnaire asks for `reference_dir` (the `reference_dir` row of the key table), but the
"Template to write" instruction says to substitute *only* the `plan_dir_root` answer while
using the layout "exact"ly — so an agent following it writes the hardcoded
`"reference_dir": "docs/discussions"`. Only the *preview* step mentions substituting both,
making the doc self-contradictory: which value ships depends on which line the agent anchors
to. A prior fix (`46026b7`) corrected the step-3 site only.

## 3. The JSONC template can drift from `defaultConfig` with no signal

Nothing in the suite or CI ties `skills/setup/SKILL.md` to `ts/config.ts`. Adding a key and
forgetting the skill passes typecheck, tests, and build. The spelled-out key count has now been
hand-corrected at least four times (`260607-0` seven→eight, `260616-0` eight→five, `5e20861`
five→six, `9981c7f` six→seven) — a recurring one-line remediation commit.

Fix at the right depth: drop the numeral (it is derivable from the template below), **and** add
a test that extracts the fenced ```jsonc block, strips comments with the repo's existing
`strip-json-comments` dependency (**not** a hand-rolled regex — a naive `//`-to-end-of-line
strip truncates any value *containing* `//`, e.g. a URL like `"https://example.com"`, and a
`run` template with a `//` path), and asserts its keys deep-equal
`defaultConfig` and round-trip through `configSchema`. That also catches value drift, which is
currently unguarded.

Note `configSchema` is currently **module-private** (`const configSchema`, no `export`, unlike
`defaultConfig`/`mergeForWrite`), so the round-trip half of that assertion requires exporting
it — a deliberate widening of the module surface, to be decided as part of this item rather
than discovered mid-implementation.

## 4. Smaller correctness bugs in Process

- Step 4 reads `mkdir -p ~/.claude/plugins/jidoka && write the file` — a shell command and a
  tool action joined by `&&`. Read as one Bash invocation it does *not* fail with "command not
  found": `write` is a real utility (`/usr/bin/write`, write(1) — message another user), so it
  runs with args `the file` and errors on the unknown user, or hangs reading stdin. Worse than
  a clean failure, and the reason to split the step.
- The target is given throughout as `~/.claude/plugins/jidoka/config.json`; the Write tool does
  not expand `~`. Nor does it expand `$HOME` — it performs no shell expansion at all, so
  substituting one for the other creates a literal `$HOME` directory. **Resolve the path first**
  (e.g. via `os.homedir()`/a Bash step) and write the absolute result.
- Step 2 says to "accept Enter-for-default", an affordance `AskUserQuestion` does not provide.
- The `plan_review` template comment says `[]` "falls back to a default codex command",
  implying an auto-run review; the composer's actual fallback is the **operator-run**
  `/codex:adversarial-review` (`skills/plan-review-prompt/SKILL.md`, Case C), so the plan can
  close with the plan-level review not run.

## References

- `skills/setup/SKILL.md`, `ts/config.ts` (`mergeForWrite`, `configSchema`, `defaultConfig`)
- `docs/developer-guide.md` — notes the skill "edits the file directly rather than shelling
  into the CLI"

Claims here are anchored by `path:symbol` / named table row rather than line number, per
`docs/CONVENTION.md` rule 2 — this item's own fixes edit the files it cites, so positional
pointers would go stale on contact.
