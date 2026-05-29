# ADR 0001 — Runner inherits project Claude settings

**Status:** Accepted

## Context

The Runner (`claude -p`) needs tool access to execute actions the developer
specifies in their prompt (e.g. create a GitHub issue via `gh`, write a file).
retroloop could manage `--allowedTools` explicitly, but this duplicates
configuration the developer already maintains in their project's
`.claude/settings.json`.

## Decision

retroloop always invokes the Runner from the project's CWD (from `cwd` in
Hook Mode, or `process.cwd()` in Manual Mode). The Claude CLI automatically
loads the project's `.claude/settings.json`, inheriting all tool permissions
and MCP server configurations.

retroloop passes no `--allowedTools` flag. Tool access is entirely delegated
to the project's existing Claude configuration.

## Consequences

- Zero additional configuration required in retroloop for tool access.
- The Runner has exactly the tools the project already trusts — no
  escalation of permissions.
- A developer who wants the Runner to have *different* tool access than
  their main session must add a project-level override — retroloop has no
  mechanism to grant tools the project hasn't already allowed.
