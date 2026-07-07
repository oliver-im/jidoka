# Dynamic workflows × jidoka — the one candidate seam (workflow-backed plan_review) was spiked and lost to the single pass on cost + recall (shelved); unit execution & plan-as-worklist need no change; no jidoka-side "use workflows" prompt (ultracode owns that layer)

Whether Claude Code **dynamic workflows** (claude.com/blog "A harness for every
task: dynamic workflows in Claude Code", 2026-06-02) intersect jidoka, and — if so
— what jidoka should actually build. Conclusion up front: **one** genuine feature
intersection — captured as backlog `260708-1`, then **spiked and shelved** (a real
run lost to the shipped single pass on cost *and* recall; see *Spike (2026-07)*
below); everything else is a usage pattern that needs no jidoka change, and one thing
(a "use workflows" prompt) that jidoka should deliberately **not** do.

## Why the question is even live: same disease, different medicine

Both are built on the *same* diagnosis of single-context failure — the article's
**goal drift**, **self-preferential bias**, **agentic laziness**; jidoka's
`docs/positioning.md` (Argument 3) makes the same case about percentage-triggered
auto-compact firing mid-execution. The medicines differ:

- **jidoka** — durable on-disk units + a human gate at each seam; lossless reload
  from disk instead of lossy compaction. Serial, human-in-the-loop. ("automation
  with a human touch" — the thin rail, produce-only.)
- **workflows** — isolated subagent context windows + autonomous JS orchestration.
  Parallel, no human mid-run.

They sit at **opposite ends of the human-in-the-loop axis**, so they're
complementary layers at different altitudes, not competitors. That framing is what
makes the rest of the analysis fall out cleanly.

## The three candidate intersections, and where each lands

**(a) Review — the one candidate seam. → spiked & shelved, backlog `260708-1`.**
A dynamic-workflow-backed *loop-until-dry* adversarial completeness review, packaged
as a review skill/slash command (the article's "distribute a workflow via a skill"
path), slots into `plan_review` as an ordinary slash-command `ReviewStep` — **no
schema change** (see `docs/data-model.md` Review commands, `ts/config.ts`). Scope is
deliberately narrow: a workflow only adds what a fixed reviewer set can't express
(fan-out over unknown N, per-finding adversarial refutation, loop-until-dry), and
those bite **only at `plan_review` on a large multi-unit diff**. `unit_review` (one
small unit diff) and `pre_review` (a few md files) get nothing. Two heterogeneous
reviewers (`/code-review` + codex) already cover the *diversity* axis, and running
them **serially** beats parallel (the second triages the first) — so parallelism is
*not* the reason to reach for a workflow. Full rationale + boundaries in the backlog
item. **Spiked 2026-07 → no-go** — see *Spike (2026-07)* below.

**(b) Unit execution — no jidoka change.**
jidoka is produce-only; *how* a unit gets executed is downstream of the seam and
invisible to jidoka. A workflow-as-executor (the Bun Zig→Rust shape: fan out over
callsites in worktrees, adversarially review, merge) earns its cost only for a unit
that is **conceptually atomic but mechanically wide** — `rename User → Account
everywhere`. jidoka supplies the single review gate; the workflow supplies the
parallel execution. One wrinkle if pursued: worktree **nesting** (a workflow's
per-agent worktrees vs. jidoka's plan-worktree/unit-branch) must merge back into the
unit branch so the unit still lands as one squash commit. Net: just prompt the
agent when a unit is wide.

**(c) Plan-as-worklist — no change, and in tension with the thesis.**
A materialized plan is units + a `blocked_by` DAG — a clean input to a workflow
pipeline. But running the whole DAG through an autonomous workflow **removes the
human from every seam**, which *is* jidoka's reason to exist. Only sensible for a
fully-mechanical plan where no unit needs judgment — and even then it's just "point
a workflow at the plan dir." Kept for the record as the least-aligned option.

## Spike (2026-07) — no-go

(a) was prototyped before committing. A bounded run compared the two arms over one
real large plan diff — the topology/HTML excision (`e00d17e..b454917`, 73 files,
deletion-heavy). **Arm A** = a single reviewer following jidoka's real
`skills/plan-review-prompt/plan-review.prompt.md`; **Arm B** = loop-until-dry
diverse-lens fan-out + a 2-agent adversarial refuter panel per finding + synthesis.

The **single pass won on both axes.** It found the one real (if LOW) completeness
leftover — an orphaned `JIDOKA_NO_OPEN` env var the excision's own grep missed — for
~80k tokens / 1 agent. The workflow returned **0** surviving findings (4 candidates,
all refuted; the loop went dry at round 1) for ~390k tokens / 11 agents / ~13 min —
~5x the cost for strictly less. Two lessons:

1. **A well-executed plan's cumulative diff isn't pathological enough to need
   fan-out** — this plan's own real plan-review was clean; there was little to find.
2. **Adversarial verification trades recall for precision, and completeness review
   wants recall** — the refuter panel correctly killed noise, but at a bar that also
   suppresses the LOW real leftovers a completeness pass exists to surface. The
   un-filtered single pass kept the one real finding.

**No-go, not never:** one clean diff, a hand-tuned refuter threshold, the loop never
exercised past round 1. Revisit only with evidence on a *genuinely broken* large plan
diff where fan-out recall beats the single pass by enough to justify ~5x — and even
then, a gentler verify. Numbers + the run (`wf_2a94afd9-ec2`) in backlog `260708-1`
*Spike result*.

## Why NOT add a "use workflows if necessary" prompt to jidoka

Tempting reasoning: plan mode fires on large tasks → jidoka runs on large tasks →
have jidoka's skill nudge "use workflows if necessary." Rejected, three independent
reasons:

1. **Weak correlation.** Plan-mode-worthy (needs decomposition/thinking-first) is
   *orthogonal* to workflow-worthy (has parallelizable fan-out). Most units are
   single-agent even in a big plan (see (a)/(b)). The nudge would false-positive on
   many plans.
2. **Mission creep.** "Use workflows" is an *execution* directive; jidoka's job is
   *decompose + gate* (produce-only, thin rail). Prescribing execution strategy is
   the thick-framework territory jidoka positions against (`docs/positioning.md`).
3. **ultracode already owns that layer** — a native, session-level, user-controlled
   opt-in for "default to workflows on substantive tasks." A baked-in prompt would
   duplicate it, do it *worse* (a fixed string vs. the model's per-task judgment + a
   real toggle), and **remove the user's choice** by hardcoding it into every plan.

The clean framing is **orthogonality**: jidoka = *what / decompose / gate*;
ultracode (or the model's own judgment) = *how much compute / orchestrate*. They
already compose — a user who wants both turns on both. The *most* jidoka should ever
do is have the decomposition skill **describe** a unit's shape ("wide mechanical
transform over ~N sites") as **information**, leaving the compute decision to
ultracode/the agent — info, not prescription. Not worth building now.

## `/goal` specifically

Raised because the article pairs loop-until-dry-style workflows with `/goal` ("a
hard completion requirement"). Verified: `/goal` is **user-initiated only**
(built-in Claude Code ≥ v2.1.139; a Haiku judge re-checks after each turn) — no
model/SlashCommand invocation path, so it **cannot** be wired into jidoka's
automated resume/review flow. It isn't needed anyway: loop-until-dry's stop
condition lives *inside* the workflow script (deterministic `while (dryRounds < K)`
— a hard control-flow guarantee, stronger than a per-turn judge). Do **not** fake
agent-driven goal enforcement with a prompt-based Stop hook — it would fight
jidoka's stop-at-the-seam design, the same reason `docs/data-model.md` warns against
double-gating with codex's Stop-time gate. Consistent with `review-pipeline.md`'s
existing "`/goal` deferred, orthogonal" note.

## The call

- **Spiked & shelved (2026-07):** a workflow-backed `plan_review` (loop-until-dry +
  adversarial refuter panel) lost to the shipped single pass on **cost** (~5x) and
  **recall** (the panel suppresses the low-severity real leftovers a completeness
  pass exists to find) — backlog `260708-1`, *Spike result*. Not building it; revisit
  only with pathological-diff evidence.
- **Don't build:** any jidoka-side "use workflows" prompting, or `/goal`
  integration — ultracode + the model's own judgment own the execution-compute
  layer; jidoka stays produce-only.
- **(b)/(c):** usage patterns, no code. Prompt the agent (or use ultracode) at
  execution time when a unit/plan genuinely earns the parallelism.

## References

- `docs/positioning.md` — thin-rail / produce-only thesis; Argument 3 (context
  management by durable artifacts) — the shared premise with workflows.
- `docs/data-model.md` (Review commands) — ReviewStep contract, print/exec
  invocation model, double-gate caution.
- `docs/discussions/review-pipeline.md` — review-pipeline direction; the prior
  `/goal`-deferred decision this doc extends.
- `docs/exec-plans/backlog/260708-1-workflow-loop-until-dry-plan-review.md` — the
  one spawned work item.
- claude.com/blog "A harness for every task: dynamic workflows in Claude Code" — the
  source; patterns, `/goal` + `/loop`, ultracode, workflow-via-skill distribution.
