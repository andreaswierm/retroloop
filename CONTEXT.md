# retroloop — Domain Glossary

## Session
A single Claude Code conversation, stored as a `.jsonl` file at
`~/.claude/projects/<project-hash>/<session-id>.jsonl`. A session contains
all turns, tool calls, and tool results for one continuous interaction.

## Subagent
A child Claude Code process spawned by a parent session via the `Agent` tool.
Each subagent runs in its own `.jsonl` file under
`<session-id>/subagents/agent-<id>.jsonl`, with a companion
`agent-<id>.meta.json` that contains a `toolUseId` linking it back to the
specific `tool_use` event in the parent session transcript.

## Formatted Session
The rendered, human-readable Markdown representation of a Session, with
Subagent transcripts embedded inline at the point of invocation. This is
what gets passed to the Runner.

## Summarized Session
A condensed version of a Formatted Session, produced by a cheap model
(the Summarizer) when the session exceeds `summarizerThresholdChars`.
Replaces the Formatted Session as Runner input when triggered.

## Runner
The external CLI that executes the developer's prompt against the session
content. In v1, always `claude -p`, invoked from the project's CWD so it
inherits the project's `.claude/settings.json` (tools, MCP servers, permissions)
automatically. Abstracted so future runners (Gemini CLI, etc.) can be plugged in.

## Summarizer
A Runner variant that condenses a large Formatted Session before the main
prompt executes. Configured separately from the main Runner model.

## Session Reader
The provider-specific module responsible for locating, parsing, and
formatting a session transcript into a Session Manifest and a Markdown body.
Each Session Reader owns its own Markdown formatting, including subagent
embedding. The `SessionReader` interface is the core expansion seam for
adding new AI CLI providers. Shape: `read({ sessionId, cwd, transcriptPath? })`
returns `{ manifest, markdown }`. Each reader exposes a `provider` string
(e.g. `"claude-code"`) and its selecting `flag` (e.g. `"--claude-session-id"`).

## Session Manifest
A structured metadata object produced by the Session Reader. Fields:
`provider`, `cliVersion?`, `sessionId`, `projectName`, `date` (YYYY-MM-DD),
`model?`, `turnCount`, `subagentCount`, `summarized`. The `summarized` field
is set by the pipeline after the Summarizer step, not by the reader.
A shared `renderManifest()` function stamps the manifest as a Markdown header
prepended to the formatted session body.

## Prompt
A developer-authored template that tells the Runner what to do with the
session. Contains interpolation tokens (`{{SESSION_ID}}`, `{{DATE}}`,
`{{PROJECT_NAME}}`, `{{PROVIDER}}`). The developer controls all output
behavior via the Prompt — retroloop does not prescribe what the Runner
produces.

## Output Target
Where the Runner's output is delivered. Supported targets:
- `stdout` — default; composable with pipes
- `file` — writes to a path with `{{SESSION_ID}}` token substitution
- `github-issue` — creates a GitHub Issue via `gh` CLI

## Pattern Store
Removed from scope. Not part of retroloop v1.

## Config File
Removed from scope. All configuration is via CLI flags only. Required flags
are enforced by commander. Optional flags have documented defaults hardcoded
in the CLI.

## Significance Threshold (`minSessionChars`)
The minimum size of a Formatted Session (in characters) for retroloop to
run at all. Sessions below this threshold exit 0 silently.

## Summarizer Threshold (`summarizerThresholdChars`)
The minimum size of a Formatted Session (in characters) for the Summarizer
to run. Sessions below this go to the Runner directly.

## Hook Mode
Invocation via Claude Code's `SessionEnd` hook. retroloop reads a JSON
payload from stdin containing `session_id`, `transcript_path`, and `cwd`.
No flags required — everything comes from stdin. There is no config file;
all configuration is via CLI flags.

## Manual Mode
Invocation directly from the terminal. Requires a provider flag such as
`--claude-session-id <id>`. The provider is selected by the presence of the
provider-specific flag. retroloop transforms the project CWD (replacing every
`/` with `-`) to locate the transcript at
`~/.claude/projects/<transformed-cwd>/<session-id>.jsonl`. A clear error
(including the attempted path) is emitted on a miss.
