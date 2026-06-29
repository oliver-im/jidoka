# Unit 02 — Realign docs and discussion to plugin-owned, bump version
**Blocked by:** 01-embed-convention-md-and-add-the-convention-subcommand**Agents involved:** main only
## Summary

Flip the documentation and the carrier discussion from "CONVENTION.md travels by copy" to "the plugin owns it, surfaced by `jidoka convention`," record the traceclip staleness evidence, then bump the minor version across the three manifests and rebuild the bundle. Depends on Unit 01 (documents and ships the command it adds).

### Tasks — docs & discussion

- **`docs/discussions/convention-carrier.md`** (the core edit) — flip the **H1 stance line** from `… travels by copy; no separate repo yet` to the new stance (plugin owns `CONVENTION.md`, embedded in the bundle, surfaced by `jidoka convention`; same principle as `jidoka paths`). Rewrite the body: the copy carrier is retired *because the pre-registered "Revisit when" trigger fired* — record the **traceclip evidence** (a stale older-generation "three kinds" copy — `ideas/`+`exec-plans/`+`design-docs/` — vs the shipped "three states" `backlog→active→completed`; ~80 of ~110 lines diverged, silently). Resolution: the installed plugin *is* the upstream, so embed-and-surface beats both per-repo copies and a separate `plan-lifecycle` repo (still deferred — the trade only pays once non-plugin users need a citable upstream). It's a living discussion — **edit in place**, do not archive.
- **`docs/discussions/convention-adoption.md`** — light consistency pass: the `jidoka adopt` open thread (`convention-adoption.md:33`) — note the *surfacing* half is now done via `jidoka convention`; only the scaffolding half (mkdir skeleton + write files) stays open. Update the two cross-references to the carrier doc (`:3` companion note, `:44` cross-ref) from "copy-from-jidoka" to "plugin-owned, surfaced by `jidoka convention`."
- **`docs/discussions/index.md`** — regenerate the carrier catalog line (`index.md:18`) to the new H1, using the re-derive recipe in `docs/discussions/AGENTS.md` (the `find … grep -hm1 '^# ' … sed … sort`) so the catalog stays byte-stable.
- **`docs/CONVENTION.md`** — update **only** the "Adopt this in a new repo" recipe (`CONVENTION.md:81`–92): present `jidoka convention` as the plugin-native way to read/vendor the spec (e.g. `jidoka convention > docs/CONVENTION.md`, or just read it on demand), keeping the `curl` raw-file fetch as the standalone / no-plugin fallback (the doc must stay jidoka-independent to read).
- **`docs/developer-guide.md`** — add `jidoka convention` to the CLI Interface usage block (`developer-guide.md:92`–98) and a "Convention mode" bullet under Mode Details (after the Paths-mode bullet, `:113`): prints the embedded spec; the embed is generated from `docs/CONVENTION.md` at build via `define` (like `__JIDOKA_VERSION__`); plugin-owned, **not copied per repo**; print-only.
- **`README.md`** — one concise sentence alongside the `jidoka paths` paragraph (`README.md:57`): the plugin owns and surfaces the convention via `jidoka convention`, so consuming repos no longer vendor `CONVENTION.md`.

### Tasks — version bump & rebuild

- Bump **0.3.3 → 0.4.0** (minor, a feature) in all three manifests: `package.json` `version`, `.claude-plugin/plugin.json` `version`, `.claude-plugin/marketplace.json` `metadata.version`. (Leave the illustrative `"version": "0.3.0"` snippet in `developer-guide.md:160` — it's a shape example, already not tracked live.)
- `npm run build` — re-embeds the edited `docs/CONVENTION.md` **and** re-stamps `__JIDOKA_VERSION__` into `dist/cli.js`; commit the rebuilt bundle.

### Acceptance

- `scripts/check-version.sh` prints "All manifests agree on 0.4.0" (also asserted by `ts/__tests__/version.test.ts`).
- `npm test` green (version test + the Unit 01 embed-match, which stays exact because the rebuild re-embeds the *edited* `CONVENTION.md`); `npm run typecheck` clean.
- `docs/discussions/index.md`'s carrier line equals the new H1 when the re-derive recipe is run.

### Notes / Integration

- **Cross-unit coupling (load-bearing):** editing `docs/CONVENTION.md` changes the *embed source*. Unit 01's embed-match test only stays green if the rebuild runs **in this unit, after** the `CONVENTION.md` edit — `pretest: npm run build` guarantees this whenever `npm test` runs. Never edit `CONVENTION.md` without rebuilding in the same unit.
- **Non-goals:** no `jidoka adopt` scaffolding (separate, deferred); no `--check` on `convention`; **do not** soften `CONVENTION.md`'s "a plan is a **directory**" line — single-file plans in consuming repos are grandfathered history, not sanctioned by the spec.
- **Landing:** gate before commit is `npm run typecheck` + `npm test` + `scripts/check-version.sh`. `main` is protected — land via PR. **Do not push or open a PR without the user's explicit go-ahead** (global rule); committing on the plan branch is fine.

## Review pipeline

- [x] `/code-review` — focused multi-angle (doc-correctness, version/embed integrity, fresh sweep); no blockers, one optional "vendor" wording tightened in place.
- [x] `codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.'` — **exec**: ran via Bash; **no findings** (independently verified embed byte-match, version agreement, and re-derived index line).

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
---
See `progress.md` for the cursor and overall plan state.
