# Unit 03 — Retire the asset-generation build step
**Blocked by:** 02-excise-the-topology-data-model-and-mermaid-renderer**Agents involved:** main only**Topology:** none
## Summary

Retire the build step whose only purpose was to embed CSS/JS/HTML templates into the (now-deleted) `html.ts`. Delete the generator, its inputs, the generated file, and rewire `package.json` so build/typecheck/test no longer depend on it.

### Tasks
- Delete `scripts/generate-assets.mjs`; the `static/` dir (`static/style.css`, `static/script.js`); `templates/page.eta`, `templates/page.html`, `templates/plan.eta`, `templates/plan.html`; and `ts/assets.generated.ts`. (Safe now: nothing imports `assets.generated.ts` after Unit 01, and `build:assets` — the only thing that regenerates it — is removed in this same unit.)
- `package.json`: remove the `build:assets` script; set `build` to `node scripts/build.mjs`; set `typecheck` to `tsc --noEmit`; set `test:watch` to `vitest`; keep `pretest` as `npm run build`. Fix `description` — drop the "; render Mermaid topology diagrams" clause.
- Keep `scripts/build.mjs` (the esbuild bundle of `ts/cli.ts` → `dist/cli.js`) and the runtime templates `templates/overview.md.eta`, `templates/progress.md.eta`, `templates/unit.md.eta`.

### Acceptance
- `npm run build` (no longer invoking build:assets), `npm test`, and `npm run typecheck` are all green; `dist/cli.js` still bundles and runs.
- No reference to `generate-assets.mjs`, `assets.generated`, `static/`, or the `page`/`plan` templates remains in source, scripts, or `package.json`.
- Rebuild and commit `dist/cli.js` so the committed bundle matches source.

### Notes
- This is the first unit where `assets.generated.ts` can actually leave the tree — Units 01–02 deliberately leave it regenerated-but-orphaned to keep each build green.

## Review pipeline

- [ ] `/code-review`
- [ ] `codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.'` — **exec**: the resuming agent runs this via the Bash tool, then surfaces the findings

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
---
See `progress.md` for the cursor and overall plan state.
