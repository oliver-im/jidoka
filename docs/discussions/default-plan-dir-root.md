# Default plan_dir_root = docs/exec-plans/active — ship the convention batteries-included, not a neutral plan/

> Settled 2026-06 (plan `260607-0-plan-lifecycle-convention`, Unit 04). Reverses the neutral `plan/` default jidoka shipped from v0.1.

## Decision

jidoka's shipped default `plan_dir_root` is `docs/exec-plans/active` — the `active/` slot of the lifecycle convention (`exec-plans/{backlog,active,completed}/`). It used to be `plan/`: a flat, conventionless directory at the repo root.

## Why

The lifecycle convention *is* jidoka's point of view — status-as-location, frozen-and-stamped archives, "reference, don't paste." Shipping `plan/` as the default handed a fresh install none of that: just a flat folder of plan dirs, no `completed/`, no archive discipline, no surrounding `backlog/` queue. The convention lived only in this repo's own scaffolding.

Making `docs/exec-plans/active` the default makes jidoka **batteries-included**: every fresh install lands plans in the convention's active slot, and `/jidoka:setup` scaffolds the rest. The opinion ships with the tool instead of living in one repo's docs.

## Trade-off

An opinionated default is a stance: jidoka now asserts *where* plans belong and *what structure* surrounds them rather than staying neutral. That's deliberate — a conventionless tool teaches nothing; the convention is the product.

It stays cheap to opt out:

- **Only the default string moved.** The renderer is convention-agnostic — materialization writes wherever `plan_dir_root` points; nothing hard-codes the lifecycle. The change is one literal in `ts/config.ts:defaultConfig`.
- **One override away.** A project sets `plan_dir_root` in `.jidoka.json` (e.g. back to `"plan"`), a global sets it in `~/.claude/plugins/jidoka/config.json`, and `/jidoka:setup` asks for it. The project-override allow-list (`ts/config.ts:PROJECT_OVERRIDE_KEYS`) and its absolute-/`..`-path validation are unchanged.

## Runtime note

The default is baked into the bundled `dist/cli.js`, so `npm run build` must run for the flip to take effect at runtime. Users who set `plan_dir_root` explicitly in their config are unaffected either way.
