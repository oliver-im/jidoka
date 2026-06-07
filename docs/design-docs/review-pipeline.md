# Review-pipeline direction after the June 2026 landscape shift

Decisions and rationale for how planview's review pipeline should use the current
Claude Code / codex review tooling. Companion to `codex-adversarial-review.md`
(which covers codex's 1MB diff behavior). Scope: review pipeline only — `/goals`
integration was raised but **deferred**, not decided.

## Trigger

Three landscape changes prompted a re-evaluation:

1. **`/goal`** (Claude Code v2.1.139) — set a completion condition; Claude works across
   turns until a separate evaluator model confirms it. Session-scoped, no plugin API,
   evaluator sees only the transcript. Orthogonal to planview's pre-execution structure.
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
the **unit body prose**, not the command — which validates planview's existing
body-as-escape-hatch model. `/simplify` is now **cleanup-only** (no bug hunting) — a
complement to `/code-review`, not a substitute.

### 5. plan_review: keep default `[]`, document `/codex:adversarial-review --base <branch>`
Plan-level review is the **completeness net** for cross-unit issues the unit gate can't
see. By plan-end the cumulative diff is **committed**, so it lives between the base branch
and HEAD — a bare working-tree review sees nothing. The recommended vehicle is the
**`/planview:plan-review-prompt` composer skill** (see #6), which emits a
`/codex:adversarial-review --base <branch>` command (reviews `merge-base..HEAD`, and
uniquely **accepts free-form focus text**). No-codex alternative: `/code-review <branch>`.

Default stays `[]` (opt-in), not a codex command, because codex has prerequisites
(`/codex:setup` + `codex login`) and a hardcoded base branch would be presumptuous — a
non-empty default would fail loudly for users without codex.

### 6. codex plan_review is operator-run — and we do NOT fork codex to change that
`/codex:review` and `/codex:adversarial-review` set `disable-model-invocation: true`, so a
resuming agent **cannot** invoke them via the SlashCommand tool. The resume protocol must
**surface the command and stop** for the human to run it (consistent with planview's
existing plan-level sign-off checkpoint).

**Chosen design — a prompt-composer skill, not the bare command.** Rather than put
`/codex:adversarial-review --base main` directly in `plan_review` (which renders as "user
runs this," losing the agent's context), the recommended entry is a new bundled skill
**`/planview:plan-review-prompt`** (agent-invocable, symmetric to `/planview:pre-plan-review`).
The resuming agent runs it; it reads the plan + cumulative diff and **composes** a focused,
ready-to-run `/codex:adversarial-review --base <branch>` command, which the operator runs.
Rationale: the agent that just executed the plan has the sharpest context for aiming a
hostile review (cross-unit seams, deferred forward-references that should now be wired up),
so the high-value work is *composing the focus*, not running the review. This also closes
the forward-reference loop — the per-unit gate defers them (decision #3), and the composer
tells the adversarial reviewer to confirm each got wired up. The skill is agent-invocable
because it is cheap (reads + composes text, no external call) and we *want* the agent to
produce the prompt; the codex command it emits remains operator-run. Note `pre-plan-review`
is itself `disable-model-invocation`, so operator-run review steps are already planview's
norm — the composer is the deliberate exception so the agent can do the aiming.

**Why not fork codex-plugin-cc to remove the flag:**
- **Dispositive:** planview is *distributable*. Its config references `/codex:adversarial-review`
  for other users, who run the **stock official codex plugin**. A fork patches only one
  machine and breaks the "install planview + official codex" story for everyone else.
- The flag is an intentional guardrail for expensive/deliberate commands (Anthropic's
  recommended use, same class as `/deploy`). Removing it fights upstream intent.
- planview's plan-level review is *already* a deliberate human checkpoint, so auto-
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
planview defaults): (a) direct `node <codex>/scripts/codex-companion.mjs adversarial-review
--wait --base <ref> "<focus>"` via Bash (community issue #232); (b) local edit of one's own
codex install. Caveat: an upstream Claude Code over-hiding bug (anthropics/claude-code#26251,
codex #211) can block even *user-typed* invocation on some versions — if bitten, the direct
companion call is the fallback.

### 7. Don't double-gate
If planview drives plan-level review, leave codex's own Stop-time `--enable-review-gate`
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
  plan-level step runs `/planview:plan-review-prompt`, which hands the operator the codex command.
- `~/.claude/plugins/planview/config.json` (global, outside the repo) — set
  `plan_review: ["/planview:plan-review-prompt"]`; fixed stale `unit_review`
  (`/code-review:code-review` → `/code-review`); refreshed annotated comments.

Historical materialized plans under `plan/**` and `notes/plan/2605*/` left untouched
(records of past work).

## Deferred

- **`/goal` integration.** Whether/how planview's unit acceptance criteria should be shaped
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
