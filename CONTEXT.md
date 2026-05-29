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

## Prompt
A developer-authored template that tells the Runner what to do with the
session. Contains interpolation tokens (`{{SESSION_ID}}`, `{{DATE}}`,
`{{PROJECT_NAME}}`). The developer controls all output behavior via the
Prompt — retroloop does not prescribe what the Runner produces.

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
No flags required — everything comes from stdin and the config file.

## Manual Mode
Invocation directly from the terminal. Requires `--session-id <id>`.
retroloop searches for the transcript at
`~/.claude/projects/<project-hash>/<session-id>.jsonl`.
