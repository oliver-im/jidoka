# Unit 04 — Flip the shipped default + update jidoka docs/skills

**Blocked by:** 02, 03
**Agents involved:** main only
**Topology:** none

## Summary

Make the convention jidoka's batteries-included default, and bring jidoka's own prose in line with the structure now on disk. The one code change is the shipped default in `ts/config.ts` (+ its tied tests); `materialize.ts`'s logic is untouched (already convention-agnostic).

### Tasks

- **Flip the shipped default**: `ts/config.ts:19` `plan_dir_root: "plan"` → `"docs/exec-plans/active"`. Update the default-tied tests (`ts/__tests__/config.test.ts` default assertion + the absolute / `..`-rejection fallbacks that currently expect `"plan"`; check `materialize.test.ts`). Run `npm run build` to refresh `dist/cli.js`. Record the rationale in `docs/design-docs/`.
- Update path examples that say "commonly `notes/plan/` or `plan/`" → the convention, in: `skills/{setup,pre-plan-review,plan-review-prompt,jidoka}/SKILL.md`, `docs/{data-model,developer-guide,agent-guide}.md`, `README.md`.
- Update `skills/setup/SKILL.md`'s `plan_dir_root` row to show the new default (`docs/exec-plans/active`) and list `plan/` as an alternative.
- Add two heuristics to `skills/jidoka/SKILL.md` + `docs/agent-guide.md`: (a) **reference code by `path:symbol`, don't paste snippets**; (b) **`ideas/` promotion** — an idea graduates to `active/` the moment it gets units.

### Acceptance

- `ts/config.ts` default is `docs/exec-plans/active`; `npm run build` refreshes `dist/cli.js`; `npm test` green with the updated default-tied assertions.
- `rg -n 'notes/plan' skills/ docs/ README.md` returns only intentional / historical mentions; default-`plan` mentions updated.
- Both heuristics appear in `skills/jidoka/SKILL.md` and `docs/agent-guide.md`.

### Notes

- Flipping the shipped default makes jidoka opinionated / batteries-included — intended; this convention is the point. `dist/cli.js` must be rebuilt for the new default to take effect at runtime.
- This unit is `blocked_by: 02, 03` because the prose references both the new `design-docs/` homes (Unit 02) and the `exec-plans` wiring (Unit 03).
