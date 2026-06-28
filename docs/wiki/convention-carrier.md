# Carrier: jidoka bundles `CONVENTION.md`, no separate repo (for now)

> Settled 2026-06 (plan `260607-0-plan-lifecycle-convention`, Unit 05).

## Decision

The canonical `CONVENTION.md` lives in **jidoka's** repo (`docs/CONVENTION.md`) and travels to other repos by **copy**. It is *not* (yet) extracted into a standalone `plan-lifecycle` repo, package, or template generator.

## Why

The convention and its reference driver co-evolve: jidoka materializes plans into `exec-plans/active/`, defaults `plan_dir_root` there (see `default-plan-dir-root.md`), and renders/creates the execution workflow (`git_workflow`). Keeping `CONVENTION.md` in the same repo means the doc and the tool that enforces it cannot drift apart between releases. A newcomer who installs jidoka gets the convention for free; a newcomer who only wants the convention copies one file (see `CONVENTION.md` → "Adopt this in a new repo").

A separate repo would buy canonical-source clarity and a tool-independent home, at the cost of a second release surface and a doc↔driver sync problem. That trade only pays once adoption is wide enough that non-jidoka users need a citable upstream.

## Revisit when

The `~/hhe` rollout (filed as an idea, graduating to its own plan after this one) copies `CONVENTION.md` into ~5 sibling repos. If those copies start to **diverge** — repos editing their local copy — that drift is the signal to extract a single upstream `plan-lifecycle` repo and have repos vendor or reference it. Until then, copy-from-jidoka is the lowest-overhead carrier.
