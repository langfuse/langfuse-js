# Shared Skills

Shared repo skills for any coding agent working in langfuse-js.

Use these from `AGENTS.md`. Claude Code reaches the same shared instructions via
the root `CLAUDE.md` compatibility symlink. Shared skills should stay focused on
reusable implementation guidance rather than runtime automation.

For the shared agent config and generated shim model, start with
[`../README.md`](../README.md).

Claude discovers shared skills through symlinks under `.claude/skills/`. Those
discovery links are created and verified by `pnpm run agents:sync` and
`pnpm run agents:check`.

## Available Skills

There are currently no shared skills in this repo.

Add them only when a repo-specific workflow becomes repeated enough to justify
durable guidance for future agents.

## Adding a New Shared Skill

1. Create a concise `.agents/skills/<skill-name>/SKILL.md`.
2. Add `.agents/skills/<skill-name>/AGENTS.md` only when the skill benefits
   from a short router or checklist on top of `SKILL.md`.
3. Prefer `references/` for detailed prose and `scripts/` for deterministic
   execution helpers.
4. Keep the skill tightly scoped to one domain or workflow.
5. Link the skill from `AGENTS.md` if it is relevant across the repo.
6. Run `pnpm run agents:sync` and `pnpm run agents:check` so Claude's projected
   `.claude/skills/` view stays in sync.
7. Update `AGENTS.md` or `CONTRIBUTING.md` if the new skill changes the default
   reusable workflow for future agents.
8. Run the relevant verification for the package or workflow the skill affects.

## Skill Design Rules

- Keep the skill tool-neutral.
- Use `SKILL.md` as the short entrypoint, not the full knowledge dump.
- Prefer `references/` for deeper docs and `scripts/` for deterministic helpers.
- Avoid copying large sections of repo docs into the skill when a stable link is
  enough.
