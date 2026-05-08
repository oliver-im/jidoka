# Unit 01 — Housekeeping & scaffolding

**Blocked by:** none
**Agents involved:** main only
**Topology:** none

## Goal

Land small fixes that aren't gated by anything else, and create the resume protocol doc so future sessions can pick this plan up from `progress.md`.

## Tasks

### CLAUDE.md (root)

- File at repo root currently asserts "documentation-only repo" with "no source code exists yet". Stale: 11 source files, 3156 LOC, builds.
- Replace the "Repository State" section with an accurate one-line status (binary builds, hook is wired, see `notes/plan/` for active plans, see `notes/AGENTS.md` for the plan convention).

### Cargo.toml + docs version reconciliation

- `Cargo.toml` says `version = "0.1.0"`. `docs/developer-guide.md` references `planview v0.2.4` in a CLI usage banner. The `--version` output is whatever clap derives from Cargo.toml.
- Bump `Cargo.toml` to `0.2.0` to mark the breaking change ahead.
- Sweep docs for hardcoded `v0.2.4` and reconcile to `v0.2.0`, or drop the version banner entirely (preferred — avoids future drift).

### README framing

- README "What planview Does" leads with the topology aspect. Re-frame to lead with "structured plan-mode output: materializes plans into `notes/plan/<slug>/` with optional per-unit topology". Topology becomes the second-line feature.
- Existing "Standalone Flow" section: rewrite. The `/planview` slash-command flow now produces a Plan and materializes a dir (not a standalone topology HTML). Direct topology rendering via the binary CLI (`echo '<topology-json>' | planview`) is still supported — give it its own short README subsection so users know that path remains.

### `notes/plan/AGENTS.md` (new file)

- Contents: the resume protocol borrowed from `~/hhe/traceclip/notes/research/260505-0-dev-workflow.md`. When a user asks to resume a plan at `notes/plan/<slug>/`, read `progress.md` first to find the cursor unit, then read the cursor unit's md.
- Cross-link to the existing top-level `notes/AGENTS.md` (which describes the directory-layout convention).

### Repo `notes/CLAUDE.md`

- Currently a one-line `@AGENTS.md`. No change needed. Confirm.

## Acceptance

- `cargo build --release` and `cargo test` pass unchanged.
- `planview --version` prints `0.2.0`.
- All cross-doc references to versions agree.
- New `notes/plan/AGENTS.md` exists with resume protocol.

## Review

- [ ] Local: `/code-review:code-review` (small, prose-only, no agent-cli needed)
- [ ] Commit with message capturing version bump + framing pivot
- [ ] Update progress.md cursor → unit 02
