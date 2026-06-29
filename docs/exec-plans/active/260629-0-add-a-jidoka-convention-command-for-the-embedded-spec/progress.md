# 260629-0-add-a-jidoka-convention-command-for-the-embedded-spec — Progress

**Cursor:** all units complete — Unit 01 and Unit 02 landed; plan-level review pending (see below), then archive + PR.

## Pre-execution review

On the first session, before starting Unit 01, the **resuming agent** works through the step(s) below against the freshly materialized plan dir, then **stops** to wait for your go-ahead — it does not roll straight into Unit 01. Follow each step's routing: **auto-run** the agent-invocable ones (the default `/jidoka:pre-plan-review`, or an `exec` template) and surface their findings; for a `print` template or an operator-run slash command, **surface the command and stop** for you to run it:

- [x] `/jidoka:pre-plan-review` — ran first session; 2 LOW notes (no-`process.exit` flush; `convention-carrier.md` `Settled`/`Revisit-when` rewrite), no blockers. Surfaced, user approved execution.

## Git workflow

This plan is worked in its own git worktree, one branch per unit:

- **Worktree:** `worktrees/260629-0-add-a-jidoka-convention-command-for-the-embedded-spec/` on branch `plan/260629-0-add-a-jidoka-convention-command-for-the-embedded-spec` (off `main`); the plan's `active/` dir lives only inside it.
- **Per unit:** branch `unit/NN-slug` off the plan branch → work + review → `git merge --squash unit/NN-slug` into the plan branch as one `Unit NN: <title>` commit → `git branch -D unit/NN-slug` → advance the cursor.
- **At the end:** `git mv` the plan dir `active/ → completed/` (+ provenance stamp), commit, then `git checkout main && git merge --no-ff plan/260629-0-add-a-jidoka-convention-command-for-the-embedded-spec`, `git worktree remove worktrees/260629-0-add-a-jidoka-convention-command-for-the-embedded-spec`.

## Done

- **Unit 02 — Realign docs and discussion to plugin-owned, bump version** (2026-06-30). Flipped `convention-carrier.md` (H1 stance + body) from "travels by copy" to "the plugin owns it, surfaced by `jidoka convention`"; recorded the traceclip staleness evidence (stale older-generation "three kinds" copy vs the shipped "three states" model, ~80/110 lines diverged) and resolved the now-fired Revisit-when trigger (separate `plan-lifecycle` repo stays deferred). Consistency pass on `convention-adoption.md` (companion note + cross-ref reframed to plugin-owned; adopt open-thread split into surfacing-done / scaffolding-open); regenerated the `index.md` carrier catalog line (byte-stable vs the re-derive recipe). Updated `CONVENTION.md`'s "Adopt this in a new repo" recipe (plugin-native `jidoka convention` + curl fallback; "a plan is a **directory**" left untouched), `developer-guide.md` (CLI usage line + Convention-mode bullet), and one `README.md` sentence. Bumped 0.3.3 → 0.4.0 across the three manifests and rebuilt `dist/cli.js` (re-embeds the edited spec + re-stamps version). Gate green: typecheck 0, **206 tests pass**, embed byte-matches source, check-version "All manifests agree on 0.4.0". Reviews: `/code-review` (focused multi-angle + fresh sweep) — no blockers, one optional "vendor" wording tightened in place; codex exec (read-only) — no findings (independently verified the byte-match, version agreement, and re-derived index line). Squash-merged as `1b313bc`.
- **Unit 01 — Embed CONVENTION.md and add the convention subcommand** (2026-06-29). `scripts/build.mjs` reads `docs/CONVENTION.md` and injects it as `__JIDOKA_CONVENTION__` via the esbuild `define` block (mirroring `__JIDOKA_VERSION__`); `ts/cli.ts` adds a print-only `convention` subcommand modeled on `paths` that writes the embedded spec verbatim (no added newline, no `process.exit` — avoids piped-stdout truncation); `cli.smoke.test.ts` asserts exit 0 + H1 present + byte-for-byte match with the source (staleness guard, kept honest by `pretest: npm run build`). Gate green: typecheck 0, **206 tests pass**, `convention` output shasum-matches the source. Reviews: codex exec (read-only) — no findings + independently verified exit 0/stdout==source; `/code-review` (9-angle) — no findings. Squash-merged as `f08ba97`. Version stays 0.3.3 (the bump is Unit 02).

## Blockers

_None._

## Notes

- When resuming, read this file first to find the cursor unit, then read the cursor unit's md. Skip `overview.md` unless this is the first session on the plan.
- On the **first session**, run the Pre-execution review checklist above before starting the cursor unit. Surface findings and revise the plan if anything material lands.
- Work one unit at a time. After finishing the cursor unit, run its review steps, then update this file: move the unit into Done with a one-liner and advance the cursor to the next unit id.
- Stop after each unit. Surface a brief summary to the user and wait for explicit go-ahead before starting the next unit. If the unit is blocked, record it under Blockers and stop without advancing the cursor.

## Plan-level review

After the last unit's review lands and is committed, run the **`/jidoka:plan-review-prompt`** composer against the cumulative plan diff — don't run the vehicle(s) below directly. The composer aims a cross-unit focus and drives whatever is configured: it injects jidoka's own plan-level review prompt into a `{ run, mode }` template (then `print`/`exec` per its mode), or composes the focus into a slash command for you. Configured vehicle(s):

- [ ] `codex exec -s read-only "{focus}"` — **exec**: the resuming agent runs this via the Bash tool, then surfaces the findings

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
