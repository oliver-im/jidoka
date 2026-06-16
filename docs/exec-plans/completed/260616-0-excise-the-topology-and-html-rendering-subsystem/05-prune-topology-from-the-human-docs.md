# Unit 05 — Prune topology from the docs and plugin manifests
**Blocked by:** 04-update-the-jidoka-skill-contract**Agents involved:** main only**Topology:** none
## Summary

Prune topology/Mermaid/HTML from the human-facing docs **and the plugin manifests** so everything jidoka ships describes what it now is: plan-markdown → reviewable markdown units + review pipeline + lifecycle convention.

### Tasks
- Prune topology/Mermaid/HTML sections and mentions from `README.md`, `AGENTS.md` (the root `CLAUDE.md` is just `@AGENTS.md`, so editing `AGENTS.md` covers both), `docs/agent-guide.md`, and `docs/developer-guide.md` (largest footprint — drop the topology validation rules, the Mermaid-id escaping section, and the render/HTML architecture; keep the parser/validator/materializer/hook/CLI coverage for the markdown path).
- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`: rewrite both plugin descriptions to the markdown-units framing (drop "optional per-unit topology", "opens overview.html in the browser", "optionally renders HTML") and remove the `topology`/`mermaid` entries from `keywords`/`tags`. These are the plugin's public identity — leaving them advertises the removed subsystem.
- `docs/data-model.md`: drop the Topology/Agent schema and execution-mode sections; keep the Plan and Unit schema (Unit without the `topology` field) and the review-step model.
- Supersede the two design docs whose entire subject is the removed view: `git mv docs/design-docs/mermaid-rendering.md docs/design-docs/superseded/` and `git mv docs/design-docs/browser-debugging.md docs/design-docs/superseded/`. Update `docs/design-docs/index.md` (move both entries out of the active list) and `docs/design-docs/superseded/index.md` if it lists entries. Leave `strategic-review.md` and `cli-over-mcp.md` in place as dated decision records — their topology/HTML mentions are historical context, not active feature docs.
- Fix the one-line cross-reference in `docs/exec-plans/AGENTS.md` that points at "the per-unit Topology shape" in data-model.md.

### Acceptance
- No references to removed modules, config flags, or topology/Mermaid/HTML remain in shipping code (`ts/`), the plugin manifests (`.claude-plugin/*`), the active skill contracts, or the primary docs (README, AGENTS, data-model, agent-guide, developer-guide); descriptions match the shipped tool.
- Frozen history is untouched: no edits under `docs/exec-plans/completed/**` and none to `docs/CONVENTION.md`.

### Notes
- Completeness check when done: `git grep -niE 'topolog|mermaid|html_output|auto_open_browser|plan_level_topology'` should return only *expected historical* hits — the kept test fixture `ts/__tests__/fixtures/plan.md`, the dated design-doc records (`strategic-review.md`, `cli-over-mcp.md`), and `docs/design-docs/superseded/**` (incl. the just-moved `mermaid-rendering.md`/`browser-debugging.md`). Any hit in `ts/` source, the plugin manifests, the active skill contracts, or the primary docs is a miss to fix.

## Review pipeline

- [ ] `/code-review`
- [ ] `codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.'` — **exec**: the resuming agent runs this via the Bash tool, then surfaces the findings

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
---
See `progress.md` for the cursor and overall plan state.
