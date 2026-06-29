# Unit 01 — Embed CONVENTION.md and add the convention subcommand
**Blocked by:** none**Agents involved:** main only
## Summary

Embed the canonical `docs/CONVENTION.md` into `dist/cli.js` at build time and add a print-only `jidoka convention` subcommand that emits it to stdout, mirroring `jidoka paths`. `docs/CONVENTION.md` stays the editable source of truth; the embed is generated from it on every build, never hand-edited.

### Approach — embed via build-time `define` (not a text-loader)

Mirror the existing `__JIDOKA_VERSION__` injection rather than introducing an esbuild text-loader. This is the lowest-risk path: zero new concepts, no ambient `*.md` module declaration, no `tsconfig` change — identical in shape to how the version already reaches the bundle.

### Tasks

- **`scripts/build.mjs`** — read `docs/CONVENTION.md` (it already reads `package.json` the same way via `readFileSync`) and add `__JIDOKA_CONVENTION__: JSON.stringify(conventionMd)` to the existing esbuild `define` block (alongside `__JIDOKA_VERSION__`, `scripts/build.mjs:24`). `JSON.stringify` produces a valid JS string literal, so esbuild substitutes it the same way it does the version.
- **`ts/cli.ts`** — add `declare const __JIDOKA_CONVENTION__: string;` next to the existing version declaration (`ts/cli.ts:11`). Register a `convention` subcommand modeled on the `paths` command (`ts/cli.ts:52`): description in the same voice, an `.action()` that does `process.stdout.write(__JIDOKA_CONVENTION__)` **verbatim** (no added trailing newline) and returns — commander exits 0. v1 is print-only: **no `--check`/diff flag.**
- **`ts/__tests__/cli.smoke.test.ts`** — add a `describe("convention", …)` block next to `describe("paths", …)`, reusing the existing `run()` helper and `repoRoot`:
  1. `jidoka convention` exits 0 and stdout contains the H1 `# The plan-lifecycle convention`.
  2. **Staleness guard:** `stdout === readFileSync(join(repoRoot, "docs", "CONVENTION.md"), "utf8")` — asserts the embedded text is byte-identical to the source. `pretest: npm run build` (`package.json`) rebuilds the bundle before tests, so a stale embed fails this test instead of shipping silently.

### Acceptance

- `npm run build` succeeds and `node dist/cli.js convention` prints the full spec, exit 0.
- `npm test` is green including the new `convention` block; `npm run typecheck` (`tsc --noEmit`) is clean.
- `dist/cli.js` is rebuilt and committed (the bundle is a committed artifact; it grows by ~the size of the spec). Version stays `0.3.3` in this unit — the bump is Unit 02.

### Notes

- **Reference, don't paste:** the command writes the embedded constant; the test compares against `readFileSync` of the source — so the match is exact by construction regardless of trailing-newline count, as long as the action writes verbatim.
- The `convention` command reads no config and no cwd, so the smoke `run()` helper (which forces `HOME=/nonexistent`) needs no `CLAUDE_PROJECT_DIR` for these cases.

## Review pipeline

- [ ] `/code-review`
- [ ] `codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.'` — **exec**: the resuming agent runs this via the Bash tool, then surfaces the findings

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
---
See `progress.md` for the cursor and overall plan state.
