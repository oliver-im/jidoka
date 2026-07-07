> STATUS: completed · 2026-07 · no-go spike — prototyped, nothing shipped; the shipped single-pass plan_review stays. Living rationale + data in `docs/discussions/dynamic-workflows.md` (§Spike 2026-07). Kept as the record of the investigation.

# 260708-1 — Workflow-backed loop-until-dry adversarial completeness review as an opt-in plan_review vehicle

> Closed no-go — captured from a design chat on the intersection of Claude Code
> dynamic workflows (claude.com/blog "A harness for every task") with jidoka, then
> spiked and closed. Frozen record; do not groom. Revisit only with evidence on a
> pathological (genuinely broken) large plan diff.

## Spike result — 2026-07 (NO-GO)

A bounded prototype ran both arms over one real large plan diff — the topology/HTML
excision (`e00d17e..b454917`, 73 files, ~9.5k lines, deletion-heavy). **Arm A:** a
single reviewer following jidoka's real
`skills/plan-review-prompt/plan-review.prompt.md` (mirrors the shipped `codex exec`
default). **Arm B:** loop-until-dry diverse-lens fan-out (seams / coverage /
invariants / claims) + a 2-agent adversarial refuter panel per finding + synthesis.

| Arm | Material findings | Agents | Tokens (total) | Wall |
|---|---|---|---|---|
| A — single pass | **1** — LOW: orphaned `JIDOKA_NO_OPEN` in `ts/__tests__/cli.smoke.test.ts` (a real leftover ref the excision's own grep missed) | 1 | ~80k | one pass |
| B — workflow | **0** survived the panel (4 candidates, all refuted; loop dry at round 1) | 11 | ~390k | ~13 min |

**The single pass won on both axes** — it found the one real (if minor) completeness
leftover, at ~5x lower cost (total tokens ≈80k vs ≈390k; output tokens 21.5k vs 82k).
Two instructive reasons:

1. **A well-executed plan's cumulative diff isn't pathological enough to need
   fan-out.** This plan's own real plan-level review came back clean at the time;
   there was little cross-unit breakage to find, so fan-out just generated noise.
2. **Adversarial verification trades recall for precision — and completeness review
   wants recall.** The refuter panel (tuned "default-refute unless material")
   correctly killed the noise, but that same bar suppresses the LOW-severity real
   leftovers a completeness pass exists to surface. The un-filtered single pass kept
   the one real finding; the adversarial arm would have refuted it.

**Limits — why "no-go", not "never":** one diff, and a *clean* one; the refuter
threshold was hand-tuned; the loop went dry at round 1 so multi-round compounding was
never exercised. To flip the decision you'd need a *genuinely broken* large plan diff
where fan-out recall beats the single pass by enough to justify ~5x — and even then,
a gentler verify that doesn't suppress LOW leftovers.

**Recommendation:** keep the shipped single-pass `plan_review`; do not productize.
Revisit only if a real large plan review is later caught *missing* a cross-unit break
a fan-out would have found. (Spike script + full run: workflow `wf_2a94afd9-ec2`.)

## The idea

Offer a **dynamic-workflow-backed** `plan_review` step that runs *loop-until-dry*
adversarial completeness review over the cumulative committed plan diff: keep
spawning finder agents until K rounds surface nothing new, verify each finding
with a per-finding refuter panel (majority vote), then synthesize. Packaged as a
review **skill / slash command** (the article's "distribute a workflow via a
skill" path), so it slots into `plan_review` as an ordinary slash-command
`ReviewStep` with **no schema change** — see the ReviewStep contract in
`docs/data-model.md` (Review commands) and the config keys in `ts/config.ts`
(`plan_review`).

## Why — and the tight scope

Established over the chat: most of the workflow/jidoka intersection does **not**
earn its coordination cost, so this item is deliberately narrow.

- Review generally does **not** need a workflow. Two heterogeneous reviewers
  (`/code-review` by Claude + codex adversarial) already cover the *diversity*
  axis, and running them **serially** is often better (the second triages the
  first). Parallelizing them is not a workflow need and loses that composition.
- A workflow only adds what a fixed reviewer set can't express: (1) fan-out over
  unknown N (one verifier per finding / per module), (2) per-finding adversarial
  refutation, (3) **loop-until-dry** completeness. Across jidoka's three review
  stages these bite **only at `plan_review` on a large multi-unit diff** — where a
  single reviewer's context degrades and cross-unit integration bugs are the class
  agentic-laziness misses. `unit_review` (one small unit diff) and `pre_review` (a
  few md files) get nothing from it — keep them serial.
- **loop-until-dry is the attractive part.** The loop lives *inside* the workflow
  script (deterministic `while (dryRounds < K)` — a hard control-flow guarantee,
  stronger than a per-turn judge), and the resuming agent triggers it with a
  single Workflow call → it fits jidoka's **agent-run** review path.

## Constraints / boundaries to respect

- **Opt-in, never a default.** The enforced core (ExitPlanMode hook + renderer)
  stays deterministic and LLM-free — a workflow must never touch materialization,
  or it forces multi-agent orchestration onto every plan. Shipping it even as a
  *default* review step re-introduces "always-on" one layer down. It is a vehicle
  the user elects in config (or the agent reaches for when a plan is visibly big).
- **`/goal` is out.** Verified user-initiated only (built-in Claude Code ≥ v2.1.139;
  a Haiku judge re-checks after each turn); no model/SlashCommand invocation path,
  so it can't be wired into jidoka's automated resume/review flow. Not needed
  anyway — the completion condition lives in the workflow's loop.
- **No Stop-hook goal enforcement.** A prompt-based Stop hook faking "don't stop
  until dry" would fight jidoka's stop-at-the-seam design — same reason
  `docs/data-model.md` warns against double-gating with codex's Stop-time gate.
  Keep the loop inside the workflow; keep the unit/plan seam as the human check.

## Open questions / next steps

- A workflow-backed review is a Workflow-tool call, not Bash/slash — reconcile it
  with the `print`/`exec` two-mechanism invocation model in `docs/data-model.md`
  (is it always agent-run, i.e. `exec`-like?).
- Where does the composed cross-unit focus come from — extend
  `/jidoka:plan-review-prompt` to emit/drive a workflow instead of a single
  `{focus}` command?
- Prototype as a standalone review skill first; measure token cost against the
  shipped single `codex exec` pass on a real large plan before promoting it to a
  documented option.

## References

- `docs/discussions/review-pipeline.md` — the review-step direction (where this
  thread's conclusion should be written up if it matures).
- `docs/data-model.md` (Review commands) — ReviewStep contract, invocation model,
  namespace / print-vs-exec / double-gate gotchas.
- `ts/config.ts` — `pre_review` / `unit_review` / `plan_review` config keys.
- claude.com/blog "A harness for every task: dynamic workflows in Claude Code" —
  patterns (adversarial verification, loop-until-done), `/goal` + `/loop`,
  workflow-via-skill distribution.
