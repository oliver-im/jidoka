# Unit 01 — Remove the HTML/browser output and topology CLI command
**Blocked by:** none**Agents involved:** main only**Topology:** none
## Summary

Strip the outermost view surface — the HTML render + browser-open path and the standalone topology-render CLI command — so `html.ts`, `output.ts`, `schema.ts`, `describe.ts`, and `example.ts` lose every importer and can be deleted. The topology data model and the Mermaid renderer stay this unit (they're still imported by `render-md.ts`/`validate.ts`), so the build stays green.

### Tasks
- `ts/cli.ts`: delete the default topology-render command (the `[file]` argument, its `--mermaid/--plan/--schema/--validate/--example/--json` options, and its action body) plus the helpers `renderAndOpen`, `runValidate`, and `formatZodIssues`. Drop the now-dead imports: `describe`, `showcase`, `renderTopologyHtml`, `mermaid`, `openBrowser`, `writeTempHtml`, `topologyJsonSchema`, `serializeTopology`, `topologySchema`, `parseTopologyJson`, `validateTopology`, `planSchema`, and `writePlanHtml`. In `runMaterialize`, remove the `cfg.html_output` → `writePlanHtml` call and the browser-open block. Trim `program.description` to drop "Visualize multi-agent task decomposition". Keep the `hook` and `materialize` commands and `parsePlanInput` (both JSON and markdown input paths).
- `ts/hook.ts`: remove `writePlanHtml` from the `./materialize.js` import, the `openBrowser` import, the `htmlOutput`/`autoOpenBrowser` fields on `HookConfig` and their wiring in `configFromEnv` (incl. the `JIDOKA_NO_OPEN` read), the `writePlanHtml` call in the staging block, and the trailing browser-open block. Keep all worktree/git_workflow logic.
- `ts/materialize.ts`: remove `writePlanHtml` and its `renderPlanHtml` import from `./html.js`. Leave `resolvePipelines`, `materialize`/`materializeAt`, and the worktree machinery intact.
- `ts/config.ts`: remove `auto_open_browser`, `html_output`, and `plan_level_topology` from the `Config` interface, `defaultConfig`, `configSchema`, `PROJECT_OVERRIDE_KEYS`, the matching branches in `applyProjectOverrides`, and `mergeForWrite`. Keep `plan_dir_root`, `git_workflow`, and the three review arrays.
- Delete modules: `ts/html.ts`, `ts/output.ts`, `ts/schema.ts`, `ts/describe.ts`, `ts/example.ts`.
- Tests: delete `ts/__tests__/html.test.ts`, `output.test.ts`, `describe.test.ts`. Trim the topology/HTML/browser cases out of `cli.smoke.test.ts`, `hook.test.ts`, `materialize.test.ts`, and `config.test.ts` (the three removed flags).

### Acceptance
- `npm run build && npm test && npm run typecheck` all green.
- `node dist/cli.js hook` (PreToolUse stdin) and `node dist/cli.js materialize <file>` still work for the markdown path; `runHook` still always exits 0.
- No remaining importer of `html.ts`/`output.ts`/`schema.ts`/`describe.ts`/`example.ts`.
- Rebuild and commit `dist/cli.js` so the committed bundle (which the ExitPlanMode hook executes) matches source.

### Notes
- Trap: do NOT touch `validate.ts:isValidId` — `hook.ts:isValidSessionId` depends on it (it only looks "agent-related"). Out of scope this unit regardless.
- `mermaid.ts`, `graph.ts`, `assets.generated.ts`, and the topology data model are intentionally left in place; they come out in Units 02–03.

## Review pipeline

- [ ] `/code-review`
- [ ] `codex exec -s read-only 'Second opinion on the working-tree diff. Plan at {plan_dir} — read the relevant unit md for intent-match; deferred forward-references it notes are expected, not bugs. Flag local correctness + intent-drift; be brief.'` — **exec**: the resuming agent runs this via the Bash tool, then surfaces the findings

_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders per the resume protocol before running — the renderer never substitutes._
---
See `progress.md` for the cursor and overall plan state.
