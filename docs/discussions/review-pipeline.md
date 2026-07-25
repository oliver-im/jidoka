# Review-pipeline direction — unit_review on the built-in /code-review, wrapped in claude -p since upstream made it operator-run (local diff, no --fix); plan_review opt-in via tool-agnostic templates; re-review to convergence, gated on the reviewer's own middle-tier severity

Decisions and rationale for how jidoka's review pipeline should use the current
Claude Code / codex review tooling. Companion to `codex-adversarial-review.md`
(which covers codex's 1MB diff behavior). Scope: review pipeline only — `/goals`
integration was raised but **deferred**, not decided.

## Trigger

Three landscape changes prompted a re-evaluation:

1. **`/goal`** (Claude Code v2.1.139) — set a completion condition; Claude works across
   turns until a separate evaluator model confirms it. Session-scoped, no plugin API,
   evaluator sees only the transcript. Orthogonal to jidoka's pre-execution structure.
   **Deferred** for a later session.
2. **`/code-review ultra`** — multi-agent *cloud* review, verified findings, but
   user-triggered + billed ($5–20, 5–10 min).
3. **codex plugin v1.0.4** — app-server architecture; review commands gained
   `--base`/`--scope`; rescue routes through the Agent tool, not Skill.

## Decisions

### 1. Do not use `/code-review ultra`
Too costly for an automated/checklist pipeline. Not a default, not a recommendation.

### 2. unit_review default: `/code-review:code-review` → `/code-review`
The old default pointed at the **code-review plugin**, which reviews a **GitHub PR**.
Per-unit review runs on a unit's **local working-tree diff before commit** — no PR
exists. The **built-in `/code-review`** (correctness bugs + reuse/simplification/
efficiency cleanups on a local diff) is the right tool. This is the central
simplification: drop the PR plugin, lean on the built-in.

- **Namespace trap** (now documented everywhere): built-in `/code-review` = local diff;
  `/code-review:code-review` = PR plugin. Easy to confuse.

### 3. No `--fix` on unit review
Unit review is **plan-blind** — it sees one unit's diff with no knowledge of later units,
so it flags intentional forward-references (a helper added in unit 01 but called in
unit 03 reads as "unused"; a half-handled enum reads as "non-exhaustive"). Findings must
stay **candidates** a plan-aware triager (human or resuming agent, both of which have
plan context) judges — never auto-applied. `--fix` would "fix" a correct forward-
reference by deleting it.

Mitigations, in order of preference:
- **Split units to be independently testable** (vertical slices) so little dangling state
  exists. Added as an explicit unit-splitting criterion in `agent-guide.md`.
- When a unit must leave a forward-reference, **name it in the unit body** so the reviewer
  discounts the expected finding. A long list of such notes is a re-split signal.
- **Plan-level review** is the real net for cross-unit completeness (see #5).

### 4. `/code-review` takes no focus argument
Its only inputs are effort (`low…max`), `--fix`, `--comment`, and a `target`. There is
**no** free-text focus/instruction. So per-unit review *focus* ("watch for races") goes in
the **unit body prose**, not the command — which validates jidoka's existing
body-as-escape-hatch model. `/simplify` is now **cleanup-only** (no bug hunting) — a
complement to `/code-review`, not a substitute.

### 5. plan_review: keep default `[]`, document `/codex:adversarial-review --base <branch>`
> **Refined (2026-06)** — see *Generalize review steps to tool-agnostic templates* at the end of this doc: `plan_review` becomes a tool-agnostic command template (codex is one vehicle, not the only one), and jidoka authors its own plan-review prompt rather than relying on codex's.

Plan-level review is the **completeness net** for cross-unit issues the unit gate can't
see. By plan-end the cumulative diff is **committed**, so it lives between the base branch
and HEAD — a bare working-tree review sees nothing. The recommended vehicle is the
**`/jidoka:plan-review-prompt` composer skill** (see #6), which emits a
`/codex:adversarial-review --base <branch>` command (reviews `merge-base..HEAD`, and
uniquely **accepts free-form focus text**). No-codex alternative: `/code-review <branch>`.

Default stays `[]` (opt-in), not a codex command, because codex has prerequisites
(`/codex:setup` + `codex login`) and a hardcoded base branch would be presumptuous — a
non-empty default would fail loudly for users without codex.

### 6. codex plan_review is operator-run — and we do NOT fork codex to change that
> **Superseded (2026-06)** — see *Generalize review steps to tool-agnostic templates* at the end of this doc: review steps gain an opt-in `exec` mode (the agent runs via the Bash tool — legitimate, since `disable-model-invocation` blocks only the SlashCommand route, not Bash), and `pre-plan-review` flips to agent-invocable + auto-run-then-stop. Still **not** forking codex: the agent bypasses the plugin via a generic `codex exec` template (escape hatch (a) below), and `print`/operator-run stays the default for the expensive codex review.

`/codex:review` and `/codex:adversarial-review` set `disable-model-invocation: true`, so a
resuming agent **cannot** invoke them via the SlashCommand tool. The resume protocol must
**surface the command and stop** for the human to run it (consistent with jidoka's
existing plan-level sign-off checkpoint).

**Chosen design — a prompt-composer skill, not the bare command.** Rather than put
`/codex:adversarial-review --base main` directly in `plan_review` (which renders as "user
runs this," losing the agent's context), the recommended entry is a new bundled skill
**`/jidoka:plan-review-prompt`** (agent-invocable, symmetric to `/jidoka:pre-plan-review`).
The resuming agent runs it; it reads the plan + cumulative diff and **composes** a focused,
ready-to-run `/codex:adversarial-review --base <branch>` command, which the operator runs.
Rationale: the agent that just executed the plan has the sharpest context for aiming a
hostile review (cross-unit seams, deferred forward-references that should now be wired up),
so the high-value work is *composing the focus*, not running the review. This also closes
the forward-reference loop — the per-unit gate defers them (decision #3), and the composer
tells the adversarial reviewer to confirm each got wired up. The skill is agent-invocable
because it is cheap (reads + composes text, no external call) and we *want* the agent to
produce the prompt; the codex command it emits remains operator-run. Note `pre-plan-review`
is itself `disable-model-invocation`, so operator-run review steps are already jidoka's
norm — the composer is the deliberate exception so the agent can do the aiming.

**Why not fork codex-plugin-cc to remove the flag:**
- **Dispositive:** jidoka is *distributable*. Its config references `/codex:adversarial-review`
  for other users, who run the **stock official codex plugin**. A fork patches only one
  machine and breaks the "install jidoka + official codex" story for everyone else.
- The flag is an intentional guardrail for expensive/deliberate commands (Anthropic's
  recommended use, same class as `/deploy`). Removing it fights upstream intent.
- jidoka's plan-level review is *already* a deliberate human checkpoint, so auto-
  invocation removes a checkpoint both designs place there — solving a non-problem.

**Community signal** (openai/codex-plugin-cc): demand to lift the flag is real and matches
this exact use case — issue **#269** ("use Codex as one of several reviewers dispatched by
a Claude Code skill", 11 👍), issue **#211** (8 👍, "makes the plugin completely useless"),
PRs **#227/#156/#157** — all stalled, **zero maintainer response**. But the most defensible
community position (lead PR #227) **keeps the flag on the heavyweight `review`** and only
lifts it on cheap commands; an independent reimplementation (`sendbird/cc-plugin-codex`)
likewise keeps review human-gated. Broad sentiment: review is expensive, agent auto-loops
cause cost blowups; the codex README's own auto stop-gate warns it "may drain usage limits
quickly" and ships off by default. De-facto workaround is a local edit, with the named
footgun "just try not to update the plugin."

No-fork escape hatches if agent-driven invocation is ever wanted (neither shipped in
jidoka defaults): (a) direct `node <codex>/scripts/codex-companion.mjs adversarial-review
--wait --base <ref> "<focus>"` via Bash (community issue #232); (b) local edit of one's own
codex install. Caveat: an upstream Claude Code over-hiding bug (anthropics/claude-code#26251,
codex #211) can block even *user-typed* invocation on some versions — if bitten, the direct
companion call is the fallback.

### 7. Don't double-gate
If jidoka drives plan-level review, leave codex's own Stop-time `--enable-review-gate`
off (it's off by default in 1.0.4).

## Repo changes made

- `ts/config.ts` — `unit_review` default → `["/code-review"]`. (Shipped `plan_review`
  default stays `[]`.)
- `ts/types.ts` — `reviewCommandSchema` comment documents the namespace trap.
- `ts/__tests__/{config,materialize}.test.ts` — default-tied assertions → `/code-review`.
- `skills/plan-review-prompt/SKILL.md` — **new** agent-invocable composer skill: reads the
  plan + cumulative diff and emits a ready-to-run `/codex:adversarial-review --base <branch>`
  command (decision #6). Auto-discovered by the plugin loader; no manifest change.
- `skills/setup/SKILL.md` — defaults table, JSONC template comments (namespace, no-fix,
  no-focus, `/simplify` cleanup-only; `plan_review` recommends the composer), closing prose.
- `README.md` — config table, three-stages list, worked example, "keep in mind" notes
  (composer as recommended `plan_review`).
- `docs/data-model.md` — stages table defaults + new "Command semantics & invocation"
  subsection (incl. composer as recommended `plan_review` vehicle).
- `docs/agent-guide.md` — added "independently testable" splitting criterion, "Mid-plan
  incompleteness" guidance, no-focus note in `review_steps`.
- `notes/plan/AGENTS.md` — resume protocol: built-in `/code-review`, triage-not-apply;
  plan-level step runs `/jidoka:plan-review-prompt`, which hands the operator the codex command.
- `~/.claude/plugins/jidoka/config.json` (global, outside the repo) — set
  `plan_review: ["/jidoka:plan-review-prompt"]`; fixed stale `unit_review`
  (`/code-review:code-review` → `/code-review`); refreshed annotated comments.

Historical materialized plans under `plan/**` and `notes/plan/2605*/` left untouched
(records of past work).

## Deferred

- **`/goal` integration.** Whether/how jidoka's unit acceptance criteria should be shaped
  into transcript-observable goal conditions, and a "drive each unit with `/goal`" workflow.
  Constraint to design around: the goal evaluator reads only the transcript (not the
  filesystem), and plugins cannot create goals programmatically.

## Sources

- Claude Code docs: `/code-review` & `/simplify` semantics, effort levels, SlashCommand tool,
  `disable-model-invocation` (skills page), `/goal` (goal page, v2.1.139), ultrareview.
- codex plugin v1.0.4 install: `commands/{review,adversarial-review,rescue}.md` frontmatter,
  `scripts/codex-companion.mjs`, `scripts/lib/git.mjs` (`resolveReviewTarget`,
  `buildBranchComparison`), `scripts/lib/state.mjs` (`stopReviewGate` default).
- Community: openai/codex-plugin-cc issues #269, #211, #238, #232; PRs #227, #156, #157;
  anthropics/claude-code#26251; HN "Code Review for Claude Code" (item 47313787);
  sendbird/cc-plugin-codex.

## Generalize review steps to tool-agnostic templates (2026-06 update — supersedes #6, refines #5)

Prompted by dogfooding the pipeline: the review *vehicle* shouldn't be hardwired to slash
commands (or to the codex plugin in particular), and the operator-vs-agent choice should be
explicit config rather than a property baked into each skill's frontmatter.

**1. Generalize the schema (`reviewCommandSchema`).** A review step is **either** a slash
command (`/…`, unchanged) **or** a bash *template* — `{ run: string, mode?: "print" | "exec" }`.
Templates make the pipeline tool-agnostic: `codex exec …`, `agent -p --mode ask …`
(cursor-agent), `gemini …`, anything. Object form over string-prefix tagging because a bash
template can legitimately start with `/` (absolute paths), so a prefix is ambiguous; an
object is unambiguous and extensible. Placeholders: `{plan_dir}`, `{base}`, `{diff_range}`
(= `merge-base..HEAD`), `{focus}`.

**2. jidoka authors its own plan-level review prompt — it does not vendor codex's.**
codex's `adversarial-review.md` is diff/code-shaped and generic (mandatory file +
`line_start`/`line_end`; its attack surface is runtime failure, not plan structure), it
drifts when upstream changes, and copying it redistributes someone else's prompt. jidoka
already owns `pre-plan-review`'s prompt; it owns a plan-level one the same way — aimed at the
cumulative committed diff, cross-unit seams, and deferred forward-references. With a
`codex exec` template, **codex supplies the model, jidoka supplies the prompt.**

**3. Operator-vs-agent (`print`/`exec`) axis spans all three stages.** `print` (default) —
surface the ready-to-run command and stop for the operator. `exec` (opt-in) — the resuming
agent runs the step via the **Bash** tool. The Bash route is legitimate exactly where the
SlashCommand route is blocked: `disable-model-invocation` blocks only `SlashCommand`, not
Bash. The default is **not** flipped — expensive/external review (codex) stays `print` +
operator-run, so the human checkpoint is preserved.

**4. `pre-plan-review` becomes agent-invocable + auto-run-then-stop.** Drop its
`disable-model-invocation`. On first session the resume agent auto-runs the `pre_review`
step, surfaces findings, and **stops before Unit 01** — surface, don't auto-revise
(auto-*invoke* ≠ auto-*apply*; the human still reads the findings and decides). Rationale:
pre-plan-review is cheap, read-only, and produces *findings* (not a command, not edits), so
none of codex's cost/guardrail reasons apply; the same "cheap, no external call, we want the
agent to do it" logic that already made the `plan-review-prompt` composer agent-invocable
applies at least as strongly. This **reverses #6's "operator-run is the norm" framing for
cheap local reviews** while leaving expensive/external review operator-run.

**Two-mechanism invocation model** (so implementers don't conflate them): `mode: print|exec`
is a **template-only** field. For **slash-command** steps, operator-vs-agent is governed by
the target skill's `disable-model-invocation` (agent-invocable when absent). "Spans all three
stages" is realized by both mechanisms together, not by `mode` alone. Placeholders are
**stage-scoped**: `pre_review` runs before any unit so it has no diff — only `{plan_dir}` is
valid there; `{base}`/`{diff_range}`/`{focus}` apply to `unit_review`/`plan_review`.

**Boundaries (load-bearing).** (a) The renderer still only *records* commands; the exit-0
ExitPlanMode hook never runs shell — all execution stays in the resume/agent layer. (b)
Review steps stay **global-config-only** (the project-override allow-list excludes the review
arrays), so a cloned repo's `.jidoka.json` can't make the agent run arbitrary shell — the
security boundary that makes `exec` safe.

**Still not forking codex** (the #6 dispositive argument holds): `exec` bypasses the codex
*plugin* by calling a generic `codex exec` template via Bash — escape hatch (a) that #6
itself named — not by patching the plugin's `disable-model-invocation`. jidoka stays
installable alongside the stock official codex plugin, and `print`/operator-run remains the
default for the heavyweight codex review.

Realized by plan `260608-0-tool-agnostic-review-command-templates-with-opt-in-exec`.

## Re-review to convergence (2026-07 update — new stage-agnostic property)

Prompted by dogfooding a real `unit_review` (in a sibling repo): one `/code-review` pass
surfaced ~20 confirmed defects, folded in across **two fix commits** — two of them
consequential. The gap that leaves: **the fix commits are themselves unreviewed code.**
Nothing reviewed the fixes. A *productive* review produces a large unreviewed delta, and a
bad or partial fix (or a fresh regression) sails straight to the seam.

**The property.** After a review, if it flagged anything material, **re-run the same review
on the post-fix diff** — repeat until a pass comes back clean. It is "auto enough" without
new machinery: the review→fix cycle is *already* agent-driven (jidoka renders the step, the
agent runs it and addresses findings); this just extends it one turn. It stays
**produce-only** — the instruction is prose rendered into the review section (Unit md /
`progress.md`); jidoka renders it, the agent runs the loop. No workflow, no schema change.
And it **strengthens the seam** rather than removing the human: the human gates a state that
already survived N review generations, not a raw first-fix state.

**Better than `/goal` for this job** (the framing that surfaced it): agent-runnable
(`/goal` is user-initiated only — *Trigger* #1 / *Deferred*); the stop signal is the
**review artifact itself**, not a Haiku transcript-judge proxy; and there is no goal string
to craft. Not a general `/goal` replacement — a better fit for *this* completion condition.

**Not the shelved fan-out** (`../exec-plans/completed/260708-1-workflow-loop-until-dry-plan-review.md`,
`dynamic-workflows.md`). That was *parallel fan-out within one snapshot* — finder agents +
an adversarial refuter panel, looping until finders go dry over a *fixed* diff — a no-go on
cost and recall. This is *serial re-review across snapshots*, and it inherits the spike's
**winner** (the single pass) while dodging both of its failure modes: (1) it only re-reviews
a *dirty* diff (the spike proved a clean diff isn't worth re-running), and (2) it has **no
refuter panel**, so it keeps the single pass's recall.

**Making "material" specific without a rubric.** Don't ask the agent to re-judge
materiality; **read the severity the reviewer already emits** (`/code-review` and codex both
tag findings). Gate and stop on the reviewer's own middle "should-fix" tier:

> Re-review iff the last pass reported ≥1 finding **at or above middle tier** — MEDIUM
> (HIGH/MEDIUM/LOW), Major (Critical/Major/Minor), P1 (P0/P1/P2). Otherwise stop.

This relocates the subjectivity to a label the reviewer already assigns with a calibrated
rubric, rather than a fresh per-loop call — a field read, not a rubric written. Pin the tier
with *examples*, not a taxonomy: **below the bar** (don't loop) — formatting, naming,
comment/docstring wording, test-only style; **at or above** (loop) — behavior, a
contract/interface, an invariant, error handling, or a change that would flip a test
outcome. Fallback for a reviewer with no severity vocabulary: "the finding required a code
change beyond formatting/naming/comments." Severity gates **whether you loop**, never which
findings surface — every pass still reports and fixes everything it finds (avoiding the
spike's recall mistake).

**Scope v0 — one extra pass, one guardrail.** Ship the minimal shape: after a review, if it
flagged a ≥middle-tier finding, re-run it **once** on the post-fix diff (K fixed at 2),
gated as above. The other two guardrails only *co-arise* if this generalizes to an unbounded
loop: a materiality-driven *termination* test (the same predicate, re-applied each round —
so the "substantive gate" and the "stop condition" are one rule, not two) and a hard cap `K`
(the oscillation backstop — fix-A-spawns-B-spawns-A never terminates on materiality alone).
**Defer** that unbounded form until there is evidence a *second* extra pass keeps finding
material things — the spike's own round-1 dryness says it usually won't. Don't build
machinery for a round you may never reach.

**Stage-agnostic.** Unlike the fan-out (which bit only at `plan_review`), serial re-review
bites wherever a review is *productive* — the motivating case was `unit_review`. It composes
with the `print`/`exec` model above: it needs an agent-run (`exec` / agent-invocable) review
to loop unattended; a `print` operator-run step converges across the operator's manual
re-runs instead.

**Status:** Realized (2026-07) by plan
`260709-0-add-opt-in-re-review-to-convergence-to-the-review-pipeline` — shipped as the
global-config toggle `review_reconverge` (default on), rendered by `renderReReviewNote` into
the unit `## Review pipeline` and the `progress.md` `## Plan-level review` block (`pre_review`
excluded). v0 is one extra pass gated on the reviewer's own middle-tier severity; the
unbounded loop stays deferred.

## `/code-review` went operator-run — wrap it in `claude -p` (2026-07 update — revises #2, applies the print/exec model to `unit_review`)

Decision #2 put the built-in `/code-review` in `unit_review` as a bare slash command. Upstream
has since set `disable-model-invocation` on it, which silently moved the per-unit gate from
agent-run to operator-run: the resuming agent can no longer reach it, so the unit loop stops
for a human at every unit. Nothing in jidoka's config or docs said so. The *rule* in
`skills/setup/SKILL.md` — "whether the resuming agent runs it or hands it to you depends on
that command's own `disable-model-invocation`" — was right all along; only which side of it
the shipped default fell on changed. That invisibility is the defect, more than the
operator-run behavior itself.

**Evidence.** Reported present on 2.1.220 and absent on 2.1.169 by binary inspection (not
re-verified here). What *is* verified here: it is documented, not a regression — Anthropic's
Code Review page states "`/code-review` is marked `disable-model-invocation`, so if you set it
as a scheduled task's prompt, Claude reads it as plain text instead of running the review."
No changelog entry ever announced it (the changelog mentions `disable-model-invocation` at no
version), and no upstream issue tracks `/code-review` specifically. The general flag-semantics
cluster says it will not be walked back: anthropics/claude-code#38969 and #43875 closed as
duplicates, **#43809 closed as not planned**. The skills docs name `/init`, `/review` and
`/security-review` as Skill-tool-reachable built-ins and do not name `/code-review`. Best
available version pin: the `disable-model-invocation` frontmatter reference carries
`min-version: 2.1.196` on its scheduled-task clause. Same complaint from another plugin
ecosystem: openai/codex-plugin-cc#211 (open) and #269 — already cited in #6 for codex, now
biting the built-in too.

**Decision: reach it through `claude -p`; don't change reviewer, don't default away from it.**
`/code-review` is still the right tool for a unit gate — #2 stands. What changes is the
*vehicle*: the shipped `unit_review` becomes
`{ run: "claude -p '/code-review {diff_range}' < /dev/null", mode: "exec" }`. This needs **no
schema work** — it is exactly the tool-agnostic template + `print`/`exec` axis the 2026-06
update already built, applied to a stage that had not previously needed it. The route is
legitimate for the same reason the codex template is: the flag gates the SlashCommand route,
not Bash, and under `-p` the slash command lands in the **user-prompt slot at the CLI layer**.
That claim (already asserted in `docs/exec-plans/AGENTS.md`) is now **verified empirically**
on 2.1.220 rather than inferred — a bare `claude -p '/code-review'` ran the real review and
returned findings in the review harness's own `{file, line, summary, failure_scenario}` schema.

**The empty-diff discovery — the part that changes the resume protocol.** That verification
ran against a deliberately empty control: branch level with upstream, clean tree, where the
documented behavior ("it needs work on the branch or in the working tree to have something to
report") predicts *nothing to review*. Instead it spent five minutes reviewing the **last
landed commit** and returned confident, well-cited findings about already-merged code. So
`/code-review` **does not fail closed**: an unattended step can pass a gate having reviewed
the wrong diff, and the output is indistinguishable from a clean review. Two consequences,
both shipped — `{diff_range}` is mandatory in the default (unranged, its scope is "commits
ahead of upstream plus uncommitted changes", so by Unit 05 it re-reviews Units 01–04), and the
resume protocol gains a **non-empty-range precondition**. Passing an explicit range also
excludes uncommitted work, so the unit must now be committed on its `unit/NN` branch before
review — a real behavior change from the old bare-command form.

**What it costs, stated plainly.** The nested session is cold. It reads `CLAUDE.md` but not
the unit's acceptance criteria, and there is no way to inject them: non-`ultra` `/code-review`
parses everything after the command as the review *target*, so it has no note slot (only
`ultra` turns trailing prose into an attached note, and `ultra` is genuinely operator-only —
billed, interactive confirmation). It also runs several minutes per unit with no context cache
shared with the outer session. And an explicit range is only as good as what the range
*contains*: probing this repo's own `HEAD~1..HEAD` — a release commit reading `4 files
changed, 4 insertions` — stalled past twenty minutes, because one of those "lines" is the
committed single-line minified `dist/cli.js` (~1.4 MB). Committed build artifacts are a
sharp edge for any ranged review; the resume protocol now says to review before rebuilding.
Against that: since 2.1.218 the in-session `/code-review` is
itself a forked background subagent, so the context gap is narrower than it first appears, and
a gate that never runs unattended is worse than a cold one that does.

**Why not the alternatives.**
- *Swap the reviewer.* `/review` and `/security-review` are Skill-tool-reachable, but the
  first is PR-shaped and the second security-only. Neither is a unit gate.
- *Add a `run: agent|operator` field to slash-command steps.* Duplicates `mode`; the
  two-mechanism model (`ts/types.ts`, "Two-mechanism invocation model") is deliberate.
- *Detect invocability at render time.* The renderer is deterministic and has no reliable way
  to introspect the host binary's flags — and it would break the "renderer only records"
  boundary that keeps the exit-0 hook from running shell.
- *Leave it operator-run and only document it.* Defensible — jidoka **is**
  stop-the-line-and-call-a-human, so a per-unit human gate is on-brand rather than a
  degradation. It stays exactly one config line away, which is why the setup skill and
  `data-model.md` now name that swap explicitly instead of burying it.

**Status:** shipped in `ts/config.ts` (`defaultConfig.unit_review`), with the non-empty-range
precondition in `docs/exec-plans/AGENTS.md` (resume protocol) and the invocation +
does-not-fail-closed properties in `docs/data-model.md` (§Command semantics & invocation).
