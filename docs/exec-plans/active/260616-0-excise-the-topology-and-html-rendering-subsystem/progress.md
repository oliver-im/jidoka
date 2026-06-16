# 260616-0-excise-the-topology-and-html-rendering-subsystem — Progress

**Cursor:** 05-prune-topology-from-the-human-docs (not started).

## Pre-execution review

On the first session, before starting Unit 01, the **resuming agent** works through the step(s) below against the freshly materialized plan dir, then **stops** to wait for your go-ahead — it does not roll straight into Unit 01. Follow each step's routing: **auto-run** the agent-invocable ones (the default `/jidoka:pre-plan-review`, or an `exec` template) and surface their findings; for a `print` template or an operator-run slash command, **surface the command and stop** for you to run it:

- [x] `/jidoka:pre-plan-review` — run twice (initial + re-review after revisions). 1 HIGH (plugin manifests advertised the removed subsystem) + 4 MED gaps surfaced; all folded into Units 04–05 + the overview's cross-cutting constraints. Re-review came back clean (Approve).

## Git workflow

This plan is worked in its own git worktree, one branch per unit. Full steps: `docs/exec-plans/AGENTS.md` + `docs/CONVENTION.md`.

- **Worktree:** `worktrees/260616-0-excise-the-topology-and-html-rendering-subsystem/` on branch `plan/260616-0-excise-the-topology-and-html-rendering-subsystem` (off `main`); the plan's `active/` dir lives only inside it.
- **Per unit:** branch `unit/NN-slug` off the plan branch → work + review → `git merge --squash unit/NN-slug` into the plan branch as one `Unit NN: <title>` commit → `git branch -D unit/NN-slug` → advance the cursor.
- **At the end:** `git mv` the plan dir `active/ → completed/` (+ provenance stamp), commit, then `git checkout main && git merge --no-ff plan/260616-0-excise-the-topology-and-html-rendering-subsystem`, `git worktree remove worktrees/260616-0-excise-the-topology-and-html-rendering-subsystem`.

## Done

- **Unit 01 — Remove the HTML/browser output and topology CLI command** ✅ Deleted `html.ts`/`output.ts`/`schema.ts`/`describe.ts`/`example.ts` + their tests; removed the standalone topology-render CLI command, the HTML render + browser-open path, and the `html_output`/`auto_open_browser`/`plan_level_topology` config flags. Markdown materialize path, hook exit-0 contract, and `isValidId` preserved. Build + 293 tests + typecheck green; `dist/cli.js` rebuilt. Reviews (`/code-review` + codex exec) clean. Squash: `39b1fec`.
- **Unit 02 — Excise the topology data model and Mermaid renderer** ✅ Removed the `Topology`/`Agent`/`Output` types + their zod schemas/serializers + `parseTopology(Json)`, the `topology` field on `Unit`, topology validation (`validateTopology` + agent error kinds + the `mermaid_id_collision` check + the per-unit topology loop), topology-fence parsing (`extractTopologyFence`), and the Mermaid renderer (`mermaid.ts` + `graph.ts` + the `unit.md.eta` mermaid block). Plan-markdown parsing + plan/unit validation behave exactly as before; a `topology` fence now stays inline in `body_markdown` as prose (regression test added). Kept `isValidId`/`AGENT_ID_RE`, `Color`, `detectUnitCycles`, `empty_task_summary`, the ReviewStep machinery. Build + 190 tests + typecheck green; `dist/cli.js` rebuilt. Reviews (`/code-review` + codex exec) clean. Squash: `ff041d1`.
- **Unit 03 — Retire the asset-generation build step** ✅ Deleted `scripts/generate-assets.mjs`, the `static/` sidecar (`style.css`/`script.js`), the HTML templates (`page.eta`/`page.html`/`plan.eta`/`plan.html`), and the orphaned (gitignored) `ts/assets.generated.ts`. Rewired `package.json`: dropped the `build:assets` script, simplified `build`→`node scripts/build.mjs`, `typecheck`→`tsc --noEmit`, `test:watch`→`vitest` (kept `pretest`=`npm run build`), and corrected the `description`. Removed the now-dead `.gitignore` entry for the generated file. Runtime templates (`overview`/`progress`/`unit` `.eta`) and `scripts/build.mjs` kept; `dist/cli.js` rebuilds byte-identical (not in the diff). Build + 190 tests + typecheck green. Reviews (`/code-review` 3-angle + codex exec) clean; codex's lone note (stale build-section lines in `developer-guide.md`) is deferred to Unit 05 — see the carry-forward note below. Squash: `fe51148`.
- **Unit 04 — Update the jidoka skill contract** ✅ Removed topology/Mermaid/HTML/browser guidance from the three runtime-facing skill contracts. `skills/jidoka/SKILL.md`: dropped the Per-unit-topology-fence, Topology-shape, and Topology-decision sections, the per-unit-topology design constraint, the topology intro sentence, and the two stale HTML/browser asides (intro + Contract scope); kept the unit-decomposition framing, markdown shape, all six heuristics, and the contract/design-constraint sections. `skills/setup/SKILL.md`: dropped the `auto_open_browser`/`html_output`/`plan_level_topology` rows + JSONC keys + questionnaire questions, fixed the key count (eight→five), and corrected the now-singular scalar-answer references. `skills/pre-plan-review/SKILL.md`: dropped the Topology-mismatch attack-surface bullet, the topology-fence review step, and the topology mentions in the frontmatter / user-focus example / grounding rules. `git grep` across `skills/` is topology/HTML-clean; build + 190 tests + typecheck green (bundle byte-identical — skill md doesn't feed it). Reviews (`/code-review` 2-angle + codex exec) clean. Squash: `09e97dc`.

## Blockers

_None._

## Notes

- When resuming, read this file first to find the cursor unit, then read the cursor unit's md. Skip `overview.md` unless this is the first session on the plan.
- On the **first session**, run the Pre-execution review checklist above before starting the cursor unit. Surface findings and revise the plan if anything material lands.
- Work one unit at a time. After finishing the cursor unit, run its review steps, then update this file: move the unit into Done with a one-liner and advance the cursor to the next unit id.
- Stop after each unit. Surface a brief summary to the user and wait for explicit go-ahead before starting the next unit. If the unit is blocked, record it under Blockers and stop without advancing the cursor.
- **Carry-forward to Unit 05 (from the Unit 03 review):** `docs/developer-guide.md` has build-process drift that Unit 05's completeness grep (`topolog|mermaid|html_output|auto_open_browser|plan_level_topology`) will **not** catch. In the **Development Setup → Building** section: the `npm run build` comment still reads "generate assets + bundle" (now bundle-only — `build:assets` was removed in Unit 03), and the line below still says "rebuild after editing anything in `ts/` or `static/`" (`static/` was deleted in Unit 03). Fix both when pruning that doc so its descriptions match the shipped tool.

## Plan-level review

After the last unit's review lands and is committed, run the **`/jidoka:plan-review-prompt`** composer against the cumulative plan diff — don't run the vehicle(s) below directly. The composer aims a cross-unit focus and drives whatever is configured: it injects jidoka's own plan-level review prompt into a `{ run, mode }` template (then `print`/`exec` per its mode), or composes the focus into a slash command for you. Configured vehicle(s):

- [ ] `codex exec -s read-only "{focus}"` — **exec**: the resuming agent runs this via the Bash tool, then surfaces the findings

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
