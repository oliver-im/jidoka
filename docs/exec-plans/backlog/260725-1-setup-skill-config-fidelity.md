# 260725-1-setup-skill-config-fidelity — Make jidoka:setup faithful to config.ts: stop clobbering hand-edited config, honor reference_dir, and guard the template against drift

Candidate work. Surfaced by two independent `/code-review` passes over `9981c7f` while working
on the `unit_review` invocability change; deliberately left out of that branch so the review
fix stayed legible. All four are pre-existing.

## 1. Re-running setup silently discards hand-edited config

`skills/setup/SKILL.md` mandates writing all top-level keys from a static template, and Process
step 1 offers only overwrite-or-keep. A user who follows the documented customization route —
hand-editing `~/.claude/plugins/jidoka/config.json` to set, say,
`unit_review: ["/code-review", "/simplify"]` and `review_reconverge: false` — loses both, plus
any manually added keys, on the next run. No diff is shown.

`ts/config.ts:mergeForWrite` encodes precisely the opposite invariant ("known keys re-emitted,
manually added keys preserved") and is covered by tests, but **grep shows no caller outside
`ts/__tests__/`** — `ts/cli.ts` exposes only `hook`/`materialize`/`paths`/`convention`, and the
setup skill edits the file directly. So the guard exists, is tested, and is unreachable. Either
expose it (a `jidoka config write` subcommand the skill shells into) or make the skill merge.

## 2. The `reference_dir` answer is dropped on write

The questionnaire asks for `reference_dir` (SKILL.md line 19), but the "Template to write"
instruction says to substitute *only* the `plan_dir_root` answer while using the layout
"exact"ly — so an agent following it writes the hardcoded `"reference_dir": "docs/discussions"`.
Only the *preview* step mentions substituting both, making the doc self-contradictory: which
value ships depends on which line the agent anchors to. A prior fix (`46026b7`) corrected the
step-3 site only.

## 3. The JSONC template can drift from `defaultConfig` with no signal

Nothing in the suite or CI ties `skills/setup/SKILL.md` to `ts/config.ts`. Adding a key and
forgetting the skill passes typecheck, tests, and build. The spelled-out key count has now been
hand-corrected at least four times (`260607-0` seven→eight, `260616-0` eight→five, `5e20861`
five→six, `9981c7f` six→seven) — a recurring one-line remediation commit.

Fix at the right depth: drop the numeral (it is derivable from the template 40 lines below),
**and** add a test that extracts the fenced ```jsonc block, strips comments, and asserts its
keys deep-equal `defaultConfig` and round-trip through `configSchema`. That also catches value
drift, which is currently unguarded.

## 4. Smaller correctness bugs in Process

- Step 4 reads `mkdir -p ~/.claude/plugins/jidoka && write the file` — a shell command and a
  tool action joined by `&&`. Read as one Bash invocation it fails with `command not found:
  write` after the mkdir succeeds.
- The target is given throughout as `~/.claude/plugins/jidoka/config.json`; the Write tool does
  not expand `~`. Spell out `$HOME` or resolve it first.
- Step 2 says to "accept Enter-for-default", an affordance `AskUserQuestion` does not provide.
- The `plan_review` template comment says `[]` "falls back to a default codex command",
  implying an auto-run review; the composer's actual fallback is the **operator-run**
  `/codex:adversarial-review` (`skills/plan-review-prompt/SKILL.md`, Case C), so the plan can
  close with the plan-level review not run.

## References

- `skills/setup/SKILL.md`, `ts/config.ts` (`mergeForWrite`, `configSchema`, `defaultConfig`)
- `docs/developer-guide.md` — notes the skill "edits the file directly rather than shelling
  into the CLI"
