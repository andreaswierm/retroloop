# retroloop

A CLI that collects a Claude Code session (including all subagent transcripts embedded inline) and runs a developer-authored prompt against it using the `claude` CLI. You control all output behavior through your prompt — retroloop handles collection, summarization, and routing.

---

## Install

```bash
npm install -g retroloop
```

**Prerequisites**

- Node.js >= 18
- [`claude` CLI](https://claude.ai/download) — installed and authenticated
- [`gh` CLI](https://cli.github.com) — required only when using `--create-issue`

---

## Usage

### Hook Mode (automatic, zero configuration)

Install retroloop as a Claude Code `SessionEnd` hook and it runs automatically at the end of every session. No flags required.

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [{ "type": "command", "command": "retroloop" }]
      }
    ]
  }
}
```

Claude Code pipes a JSON payload to stdin; retroloop detects it, extracts the session, and runs the full pipeline.

### Manual Mode

Pass a provider flag to identify the session to process:

```bash
retroloop --claude-session-id <session-uuid>
```

retroloop resolves the transcript at `~/.claude/projects/<cwd-as-path>/<session-id>.jsonl`.

**Examples**

Run with a custom prompt template:

```bash
retroloop --claude-session-id abc-123 --prompt-file ./my-prompt.md
```

Write the output to a file:

```bash
retroloop --claude-session-id abc-123 --output-file ./retros/{{SESSION_ID}}.md
```

Create a GitHub issue with the output as the body:

```bash
retroloop --claude-session-id abc-123 --create-issue
```

Create a GitHub issue with a custom title and labels:

```bash
retroloop --claude-session-id abc-123 --create-issue \
  --github-title "Retro {{DATE}}: {{SESSION_ID}}" \
  --github-labels "retroloop,review"
```

Force a run even for small sessions:

```bash
retroloop --claude-session-id abc-123 --force
```

---

## CLI Flags

### Provider (required in Manual Mode, auto-resolved in Hook Mode)

| Flag | Description |
|---|---|
| `--claude-session-id <id>` | Claude Code session UUID to process |

### Prompt

| Flag | Default | Description |
|---|---|---|
| `--prompt-file <path>` | bundled retrospective prompt | Path to a custom prompt template |

### Runner

| Flag | Default | Description |
|---|---|---|
| `--model <model>` | claude CLI default | Model for the main runner |

### Summarizer

| Flag | Default | Description |
|---|---|---|
| `--summarizer-model <model>` | `claude-haiku-4-5-20251001` | Model for the summarization pass |
| `--summarizer-threshold-chars <n>` | `50000` | Session size (chars) above which summarization runs |

### Significance Gate

| Flag | Default | Description |
|---|---|---|
| `--min-session-chars <n>` | `1000` | Sessions smaller than this are skipped silently |
| `--force` | — | Bypass the significance gate regardless of session size |

### Output

| Flag | Default | Description |
|---|---|---|
| `--output-file <path>` | — | Write runner output to this path. Supports `{{SESSION_ID}}` |
| `--create-issue` | — | Create a GitHub issue with the runner output as the body |
| `--github-repo <owner/repo>` | auto-detected from `git remote origin` | Target repository for the issue |
| `--github-labels <labels>` | `retroloop` | Comma-separated labels for the created issue |
| `--github-title <template>` | `Retro: {{SESSION_ID}} — {{DATE}}` | Issue title template. Supports `{{SESSION_ID}}` and `{{DATE}}` |

---

## Prompt Tokens

Available in `--prompt-file` templates and `--github-title`:

| Token | Value |
|---|---|
| `{{SESSION_ID}}` | The session UUID |
| `{{DATE}}` | Today's date, `YYYY-MM-DD` |
| `{{PROJECT_NAME}}` | `basename` of the project working directory |
| `{{PROVIDER}}` | The AI provider name (e.g. `claude-code`) |

`{{SESSION_CONTENT}}` is an internal token used in prompt templates to inject the session transcript. It is replaced at runtime and is not available in `--github-title`.

---

## Provider Abstraction

retroloop uses a `SessionReader` interface to support multiple AI CLI providers. Each reader owns transcript parsing and formatting for its provider, and exposes a CLI flag (e.g. `--claude-session-id`) that selects it. The `claude-code` reader ships built in; additional providers can be registered by extending the registry.

---

## How It Works

1. **Read** — locate the session transcript, parse it, embed subagent transcripts inline
2. **Significance gate** — skip sessions below `--min-session-chars` (exit 0)
3. **Summarize** — if the session exceeds `--summarizer-threshold-chars`, condense it with a cheap model before the main pass
4. **Load prompt** — use `--prompt-file` or the bundled retrospective prompt; interpolate tokens
5. **Run** — spawn `claude -p <prompt>` from the project CWD (inherits `.claude/settings.json`)
6. **Output** — always print to stdout; optionally write to a file or create a GitHub issue
