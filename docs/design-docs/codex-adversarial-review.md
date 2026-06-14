# Codex Adversarial Review on Large Diffs (May 2026)

How `/codex:adversarial-review` behaves on large diffs, why it rejects, and how jidoka should invoke it.

## Context

jidoka reviews are intended to use `/codex:adversarial-review` from the [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) plugin (v1.0.4). On heavy PRs the command fails with:

```
Input exceeds the maximum length of 1048576 characters.
```

This note records why that happens, what the plugin already does about it, and the invocation style jidoka should standardize on.

## Two review paths, two failure modes

`/codex:review` and `/codex:adversarial-review` look similar but use different Codex APIs.

**`/codex:review` — native reviewer.** Calls `review/start` with only a *target reference* (`{ type: "uncommittedChanges" }` or a branch range). Codex's built-in reviewer fetches the diff internally. The plugin never touches the diff body, so the 1MB limit does not apply on the plugin side. Rejections here originate inside Codex CLI / app-server (model context, sandbox, or model-specific 400s — see openai/codex-plugin-cc#309, #270). The endpoint does **not** accept a custom prompt, which is why the plugin rejects focus text on this command.

**`/codex:adversarial-review` — custom prompt via `turn/start`.** The plugin assembles the prompt itself in `buildAdversarialReviewPrompt` (`plugins/codex/scripts/codex-companion.mjs`) and ships it as a regular turn. The Codex API caps turn input at **1,048,576 characters**. Two existing mitigations in `plugins/codex/scripts/lib/git.mjs`:

- `DEFAULT_INLINE_DIFF_MAX_FILES = 2`
- `DEFAULT_INLINE_DIFF_MAX_BYTES = 256 * 1024`

When either threshold is exceeded, `collectReviewContext` flips to **self-collect** mode: the prompt drops the diff body and instead carries the merge-base SHA, commit log, diff stat, and changed-file list, with guidance telling Codex to run `git diff` itself in its read-only sandbox.

The remaining failure is a **boundary case**: when the diff fits in 256KB *bytes* but expands past 1MB *characters* (multi-byte UTF-8), or when template + 256KB diff + guidance + focus text just barely crosses 1MB. PRs openai/codex-plugin-cc#313 and #314 propose prompt-level caps with truncation fallbacks; neither is merged as of 2026-05-14.

## Self-collect already does what we want

Reading `collectBranchContext` (`plugins/codex/scripts/lib/git.mjs:261-289`), the self-collect prompt already includes everything Codex needs to fetch the diff itself:

- merge-base SHA + branch name in the summary line
- commit oneline log (more SHAs)
- diff stat (file-by-file +/- summary)
- full changed-file list

For working-tree mode no base ref is needed — `git diff` and `git diff --cached` against HEAD is implicit.

Codex runs with `sandbox: "read-only"`, which permits the git commands it needs.

## Decision for jidoka

**Always invoke `/codex:adversarial-review` in a way that triggers self-collect.** Do not rely on inline-diff context. The benefits of inlining (one fewer Codex turn) are marginal; the cost (random 1MB rejections on heavy PRs) is high.

Operationally, this means one of:

1. **Trust the existing threshold.** Any review that touches >2 files or >256KB already self-collects. For jidoka, almost any review larger than a single-unit edit will land here.
2. **Force self-collect explicitly** if a tiny review still hits the boundary case. The plugin does not currently expose a `--no-inline` flag; the cleanest forcing function is to invoke against a base ref where the diff naturally crosses the threshold, or to patch `DEFAULT_INLINE_DIFF_MAX_BYTES = 0` locally.
3. **Pull PR #313 or #314** when one merges — both add a hard prompt cap (~800KB) with a truncation fallback, eliminating the boundary failure by construction.

The cleanest upstream fix is option (3) generalized: drop the inline path entirely from adversarial-review. That removes the failure mode by construction, at the cost of a small quality dip on tiny diffs where Codex now has to fetch them itself. Worth filing as a follow-up PR if #313/#314 stall.

## Practical invocation

For jidoka reviews:

```bash
# Working tree (uncommitted changes against HEAD)
/codex:adversarial-review --wait

# Branch review against a base ref
/codex:adversarial-review --base main --wait
```

If the diff is tiny and the review still rejects with the 1MB error, widen the scope (review the whole branch instead of one commit) or fall back to `/codex:review` which uses Codex's native reviewer and is unaffected by the local prompt-cap bug.

## References

- [openai/codex-plugin-cc#11](https://github.com/openai/codex-plugin-cc/issues/11) — original ENOBUFS + 1MB report (closed, fixed by #179)
- [openai/codex-plugin-cc#179](https://github.com/openai/codex-plugin-cc/pull/179) — first fix: 256KB / 2-file inline cap → self-collect fallback (merged April 2026)
- [openai/codex-plugin-cc#313](https://github.com/openai/codex-plugin-cc/pull/313) — open: 850KB byte + 900KB char prompt cap with binary-search truncation
- [openai/codex-plugin-cc#314](https://github.com/openai/codex-plugin-cc/pull/314) — open: 800KB hard cap, UTF-8-safe fallback chain
- [openai/codex-plugin-cc#122](https://github.com/openai/codex-plugin-cc/issues/122) — related: `codex:rescue` times out on large diffs
- [openai/codex-plugin-cc#6](https://github.com/openai/codex-plugin-cc/issues/6) — feature: auto-scale review depth by diff size
