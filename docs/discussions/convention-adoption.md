# Convention adoption across repos — config-driven paths (configure the surface, fix the shape); enforce hard at create, soft at transition

> Living discussion. Current stance up top; open threads at the end. Companion to `convention-carrier.md` (how `CONVENTION.md` the *document* is carried — now plugin-owned, surfaced via `jidoka convention`) — this doc is about the *plugin* carrying, configuring, and enforcing the convention inside a consuming repo.

## Current stance

When another repo adopts the lifecycle convention via the jidoka plugin, split the convention in two and treat each differently:

- **The surface (configurable).** *Where* the convention lives: one root (`plan_dir_root`, whose `backlog`/`completed` siblings derive) plus the separate `reference_dir`. Per-project via `.jidoka.json`.
- **The shape (fixed).** The three states, the leaf names `backlog`/`active`/`completed`, the re-derivable catalog, status-is-location, the two rules. Making these configurable would dissolve the convention into "some folders." **Configure the *where*, never the *what*.**

Enforcement is layered by *moment*, strongest where it is cheapest:

| Moment | What's enforced | Lever | Strength |
|---|---|---|---|
| **Create** (every plan) | new plan lands in `active/` with a valid `YYMMDD-N-slug` | the renderer (`materialize`) | hard, deterministic, free |
| **Transition** (lifecycle) | `git mv` between states, stamp on archive, catalogs current | the operational `AGENTS.md` the agent reads (+ optional helper commands) | soft contract |
| **Adopt** (once) | skeleton + contract docs exist | `setup` / a future `adopt` | scaffolding |

For a solo multi-repo setup whose agent always reads `AGENTS.md`, **deterministic-at-create + soft-contract-for-transitions** is the right level. Hard hook/CI gates are friction the renderer already makes mostly unnecessary — the moment that matters most (creation) is the one that's already hard-enforced.

## What shipped

- **`reference_dir`** config key (default `docs/discussions`), project-overridable in `.jidoka.json` with the same `isAbsolute`/`..` validation as `plan_dir_root`.
- **`resolveConventionPaths(cfg)`** — `active` *is* `plan_dir_root`; `backlog`/`completed` derive as fixed-named siblings; `reference` is `reference_dir`. Kept **out** of `materialize`, so the renderer stays convention-agnostic (see `default-plan-dir-root.md`).
- **`jidoka paths`** — one resolver that prints the layout as JSON (layered global < project; `--absolute` joins `CLAUDE_PROJECT_DIR`), so skills/docs read it instead of hardcoding `docs/exec-plans/...`. This is the "skills reference config" mechanism.
- `setup` writes `reference_dir`; developer-guide + README document the command and the derive-not-configure rule.

(Landed on branch `docs/convention-exec-plans-only`, alongside the `docs/wiki → docs/discussions` reframe.)

## Open threads / deferred

- **Adopt command.** The *surfacing* half is now done: `jidoka convention` prints the plugin-owned spec on demand (read it live, or pin a refreshable snapshot with `jidoka convention > docs/CONVENTION.md`), which closes the copy-drift loop `convention-carrier.md` flags. What stays open is the *scaffolding* half — `setup` writes config but does **not** create the `{backlog,active,completed}/` skeleton or drop in the operational `AGENTS.md` docs (today still a manual `mkdir`). A `jidoka adopt` that scaffolds the skeleton and writes those files — sourcing the spec from `jidoka convention`, not a `curl` — is the remaining step.
- **Mechanical transition commands.** `jidoka archive <id>` (git mv `active→completed` + prepend the stamp) and `jidoka index [--check]` (regenerate / verify the catalogs) convert the drift-prone soft steps into commands that can't be done wrong. `--check` is the optional CI/hook gate — *available*, not on by default.
- **How hard to enforce?** Current lean: soft-plus-helpers, not hard gates. Revisit if drift actually bites.
- **Does the plugin own the reference area?** The convention scopes itself to `exec-plans/`; `reference_dir` is surfaced, but the reference area is "the repo's own business." Whether `adopt` scaffolds `discussions/` (+ its `AGENTS.md`) is open — convenience, not mandate.

## Why not just hardcode (the rejected alternative)

Hardcoding `docs/exec-plans/...` in skill/doc prose forces every consuming repo onto jidoka's exact layout, and any per-repo difference silently rots the prose. Config + one resolver (`jidoka paths`) is a single source of truth that's correct per-project for free — the same "re-derive, don't hand-maintain" principle the `index.md` catalogs use. An append-to-index / hardcode-and-remember approach was rejected for the same reason it was rejected for the catalogs: it drifts.

## Cross-references

- `convention-carrier.md` — how `CONVENTION.md` the document is carried (plugin-owned, surfaced via `jidoka convention`).
- `default-plan-dir-root.md` — why the renderer ships the convention as its default yet stays convention-agnostic.
- `../CONVENTION.md` — the portable lifecycle (governs `exec-plans/` only; the reference area is each repo's own business).
