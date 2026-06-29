# Convention carrier — the plugin owns CONVENTION.md and surfaces it via jidoka convention; no separate repo yet

> Settled 2026-06 (plan `260607-0-plan-lifecycle-convention`, Unit 05); updated 2026-06 (plan `260629-0-add-a-jidoka-convention-command-for-the-embedded-spec`) — the copy carrier was retired for a plugin-owned embed.

## Decision

The canonical `CONVENTION.md` lives in **jidoka's** repo (`docs/CONVENTION.md`) and is **owned by the plugin**: the build embeds it into `dist/cli.js` (esbuild `define`, the same mechanism that injects `__JIDOKA_VERSION__`), and `jidoka convention` prints it on demand — the same principle as `jidoka paths` surfacing the resolved layout. A repo that uses jidoka reads the plugin's spec instead of vendoring its own `CONVENTION.md` copy. It is still *not* extracted into a standalone `plan-lifecycle` repo, package, or template generator.

The earlier carrier — "travels by copy," each repo vendoring its own `docs/CONVENTION.md` — is **retired**. `docs/CONVENTION.md` remains the single editable source; the embed is generated from it on every build (never hand-edited) and a smoke test asserts the two stay byte-identical, so the shipped spec can't drift from its source.

## Why

The convention and its reference driver co-evolve: jidoka materializes plans into `exec-plans/active/`, defaults `plan_dir_root` there (see `default-plan-dir-root.md`), and renders/creates the execution workflow (`git_workflow`). Keeping `CONVENTION.md` in the same repo means the doc and the tool that enforces it cannot drift apart between releases.

The open question was always how the spec should *reach* other repos. Copy-from-jidoka was the lowest-overhead carrier — until the copies proved they drift silently. **The pre-registered "Revisit when" trigger fired:** a sibling repo (traceclip) was found running a **stale, older-generation** copy — the old "three kinds" model (`ideas/` + `exec-plans/` + `design-docs/`) — while jidoka had already shipped the new "three states" model (`backlog/` → `active/` → `completed/`). Roughly **80 of ~110 lines had diverged, silently**: a stale copy doesn't merely drift in wording, it forks into a *different model* and actively misleads any agent that greps it.

The resolution isn't a separate upstream repo — it's that **the installed plugin already *is* the upstream.** A repo that uses jidoka has the canonical spec one command away (`jidoka convention`); embedding it in the bundle and surfacing it on demand removes the per-repo copy without adding a second release surface. That beats both per-repo copies (which drift into a wrong model) and a standalone `plan-lifecycle` repo (a second release surface *plus* a doc↔driver sync problem). The standalone repo stays deferred — that trade only pays once non-plugin users need a citable upstream, and surfacing-from-the-plugin doesn't foreclose it.

## Revisit when

Extract a standalone `plan-lifecycle` repo only when **non-jidoka users need a citable upstream** — when someone wants the convention without installing the plugin, often enough that the `curl` raw-file fallback (still documented in `CONVENTION.md` → "Adopt this in a new repo") stops being enough. Until then the plugin is the carrier: `jidoka convention` for plugin users, the `curl` fetch for everyone else, both pointing at the one source in this repo.
