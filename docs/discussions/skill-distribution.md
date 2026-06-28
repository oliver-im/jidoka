# Skill distribution — one canonical source copied into per-agent dirs (not symlinks); three-layer local testing

How jidoka should distribute a single skill set across multiple coding agents without relying on symlinks, and how to test those skills locally after making repo changes.

## Context

jidoka's renderer is designed as a portable CLI binary, while skills and hooks are platform adapters around that binary. If the project wants to support multiple agents such as Claude Code, Codex, and Cursor, the skill authoring model needs to solve three problems together:

1. **Single source of truth** — edit the skill once
2. **Distribution** — install it into the right locations for each agent
3. **Local testing** — verify the edited skill actually loads and works before release

The main practical concern is symlink reliability. In theory, symlinks give a single canonical copy. In practice, discovery and live-reload behavior differ across tools, which makes copy-based installs safer.

## Official discovery locations

### Claude Code

Official docs: [Extend Claude with skills](https://code.claude.com/docs/en/skills)

- Personal skills: `~/.claude/skills/<skill-name>/SKILL.md`
- Project skills: `.claude/skills/<skill-name>/SKILL.md`
- Claude Code also discovers nested `.claude/skills/` directories in subdirectories, which is useful in monorepos.

### Codex

Official docs: [Agent Skills - Codex](https://developers.openai.com/codex/skills/create-skill/) and [Customization - Codex](https://developers.openai.com/codex/concepts/customization)

- Repo skills: `.agents/skills/<skill-name>/SKILL.md`
- User skills: `~/.agents/skills/<skill-name>/SKILL.md`
- Admin skills: `/etc/codex/skills`
- Bundled system skills: shipped with Codex

Important clarification: Codex documentation uses `.agents/skills/` and `~/.agents/skills/` for custom skills. `~/.codex/` is for `AGENTS.md` and config, not the official custom skill location.

### Cursor

Official docs: [Agent Skills - Cursor Docs](https://www.cursor.com/docs/context/skills)

- Project skills: `.agents/skills/<skill-name>/SKILL.md`
- Project skills: `.cursor/skills/<skill-name>/SKILL.md`
- User skills: `~/.cursor/skills/<skill-name>/SKILL.md`

Cursor also explicitly states that it loads compatible skill folders from `.claude/skills/`, `.codex/skills/`, `~/.claude/skills/`, and `~/.codex/skills/`.

## Key finding: shared source plus copied installs beats symlinks

**Verdict: Use one canonical source directory in the repo, then copy into agent-specific locations. Do not make symlinks the primary workflow.**

Why:

- **Discovery behavior varies** across agents and versions.
- **File watching/live reload is weaker with symlinks**, even where initial discovery works.
- **Broken relative links fail badly** and are easy to misconfigure in dotfile and monorepo setups.
- **Copy-based installs are deterministic** and easier to validate in CI.

The clearest recent evidence is Codex issue [openai/codex#11314](https://github.com/openai/codex/issues/11314), where users reported symlinked `.agents/skills` roots failing to load. The issue discussion suggests two practical truths:

1. Valid symlinks may work in some setups
2. Live updates and diagnostics around symlinks are still a source of confusion

That makes symlinks acceptable as an expert-only shortcut, but not as the recommended distribution method for a project meant to be reused by others.

## Ecosystem pattern: `.agents/skills` as the canonical interoperable layout

The Agent Skills ecosystem is converging on `.agents/skills/` and `~/.agents/skills/` as the cross-client convention. The Agent Skills guidance for client implementers explicitly recommends scanning both client-specific directories and `.agents/skills/`, and describes `.agents/skills/` as the emerging interoperability path.

This matters because:

- Codex already uses `.agents/skills/` officially
- Cursor loads `.agents/skills/` officially
- Claude Code does not, but it can consume the same `SKILL.md` format once copied into `.claude/skills/`

For jidoka, this suggests a clean architecture:

- **Canonical source:** `.agents/skills/` or `skills-src/`
- **Generated adapter location for Claude Code:** `.claude/skills/`
- **Optional generated adapter location for Cursor:** `.cursor/skills/` only if Cursor-specific testing or packaging needs it

## What other projects and toolchains appear to do

The common practical patterns are:

### 1. Canonical repo + sync/install script

Keep one source tree in version control and provide a script that copies skills into target agent directories.

This is the most robust pattern for:

- team onboarding
- CI verification
- release packaging
- avoiding symlink edge cases

### 2. Package-manager style installers

The `npx skills` ecosystem tool supports multi-agent installation and offers `--copy` specifically for environments where symlinks are not desirable.

That is strong evidence that the wider ecosystem has already run into the same problem and solved it with explicit copy-based installation.

### 3. Generated duplicates committed to the repo

Less elegant, but operationally simple:

- author in one place
- run sync
- commit both source and generated outputs

This works well when users want out-of-the-box discovery in multiple agents without running an installer first.

## Recommended model for jidoka

### Source of truth

Prefer one of these:

1. **`.agents/skills/` as canonical source**
   Best if jidoka wants to align with the open Agent Skills ecosystem and keep the repo interoperable by default.
2. **`skills-src/` as canonical source**
   Best if jidoka expects future per-agent transforms or generated metadata and wants a clearly non-runtime source directory.

If no per-agent transforms are needed, `.agents/skills/` is the simplest choice.

### Generated targets

Generate these as needed:

- `.claude/skills/` for Claude Code
- `.cursor/skills/` for Cursor only if project-local Cursor packaging/testing benefits from it
- user-level install targets only during local smoke testing or explicit install commands

### Distribution commands

jidoka should eventually expose a small distribution surface such as:

- `scripts/sync-skills` — copy canonical skills into repo-local target directories
- `scripts/install-skills --agent <agent> --scope <repo|user>` — install into user-level directories for local testing
- `scripts/check-skills` — verify generated copies are up to date

These do not need to be part of the renderer binary. They are packaging/dev tooling around the skill layer.

## Local testing after editing a skill

After fixing a skill in the repo, testing should happen in three layers.

### 1. Static validation

Validate the skill files without launching any agent:

- `SKILL.md` exists in every skill directory
- YAML frontmatter parses
- required fields exist: `name`, `description`
- `name` matches directory name
- referenced scripts and documents exist
- no broken relative links inside the skill bundle

This should be automated and run in CI.

### 2. Sync validation

Validate the distribution layer:

- generated directories match canonical source
- stale files are removed from target directories
- dry-run/check mode reports drift cleanly
- CI fails if generated copies are out of date

This is the key protection against "fixed in source, broken in installed copies."

### 3. Runtime smoke tests

Actually open the target agent and verify:

- the skill appears in the agent's discovered skill list or menu
- explicit invocation works
- implicit invocation works if intended
- referenced scripts run from the correct working directory
- any reload/restart requirement is documented

Smoke tests matter because skill systems use progressive loading and tool-specific discovery rules. Passing static checks does not prove the agent will actually pick the skill up.

## Minimal test matrix for jidoka

For each supported agent, the useful smoke-test cases are:

### Claude Code

- Repo-local discovery from `.claude/skills/`
- Explicit invocation via `/skill-name`
- Automatic invocation when description matches
- Any hook-related behavior if the skill is tied to the plan workflow

### Codex

- Repo-local discovery from `.agents/skills/`
- Explicit invocation via `$skill-name` or skill picker flow
- Automatic invocation based on description
- Restart behavior after skill changes

### Cursor

- Repo-local discovery from `.agents/skills/` and, if generated, `.cursor/skills/`
- Explicit invocation via `/skill-name`
- Automatic invocation based on description
- Visibility in Settings -> Rules -> Agent Decides

## Release and distribution implications

If jidoka wants the skill layer to be reused outside this repository, distribution should be designed early rather than bolted on later.

The likely progression is:

1. **Repo-local sync first** — enough for development and internal use
2. **Install command second** — enough for local user-level testing across agents
3. **Published release assets third** — zip/tarball or GitHub Release bundles containing skills plus install instructions
4. **Package-manager integration later** — Homebrew, `npx skills`, or similar if adoption justifies it

This mirrors the lesson from [`googleworkspace-cli.md`](googleworkspace-cli.md): distribution is part of the product, not a post-launch chore.

## Implications for jidoka specifically

The skill layer should remain thin and adapter-like:

- the durable asset is still the `jidoka` CLI binary
- skills should mostly explain how to call the binary and interpret its outputs
- per-agent differences should live in generated skill bundles, not in the renderer itself

That keeps the architecture aligned with the conclusion in [`cli-over-mcp.md`](cli-over-mcp.md): the portable interface is the CLI, while skills are platform-specific packaging around it.

## Recommendation

**Recommended path for V1:**

1. **Choose one canonical repo source for skills** — preferably `.agents/skills/`
2. **Generate/copy into `.claude/skills/` for Claude Code**
3. **Avoid symlinks in the documented workflow**
4. **Add validation + sync-check scripts before the skill layer grows**
5. **Define a manual smoke-test checklist for Claude Code, Codex, and Cursor**
6. **Treat release/install tooling as part of the skill work, not separate future cleanup**

This gives jidoka:

- one edit point
- predictable multi-agent installs
- CI-verifiable distribution
- a practical local testing loop
- fewer cross-agent surprises than a symlink-based setup
