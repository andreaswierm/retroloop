# retroloop — Implementation Plan

## What it does

retroloop is a CLI that runs at the end of a Claude Code session (via `SessionEnd`
hook or manually), collects the full session transcript including all subagent
transcripts embedded inline, and executes a developer-authored prompt against
that session using the Claude CLI. The developer controls all output behavior
through their prompt. retroloop handles collection, summarization, and routing.

---

## 1. Folder structure

```
retroloop/
├── src/
│   ├── index.ts                  # CLI entry point — commander setup, flag parsing
│   ├── session/
│   │   ├── resolve.ts            # locates transcript path from session-id + CWD
│   │   ├── reader.ts             # parses .jsonl into typed SessionEvents
│   │   ├── formatter.ts          # renders SessionEvents → Markdown string
│   │   └── summarizer.ts        # runs cheap model to condense large sessions
│   ├── subagents/
│   │   └── embedder.ts           # reads subagent/ dir, embeds transcripts inline
│   ├── runner/
│   │   └── claude.ts             # spawns `claude -p` from project CWD
│   ├── output/
│   │   ├── file.ts               # writes runner stdout to a file path
│   │   └── github-issue.ts       # calls `gh issue create` with runner stdout
│   └── prompt/
│       ├── loader.ts             # loads --prompt-file or bundled default
│       ├── interpolator.ts       # substitutes {{TOKEN}} in prompt strings
│       └── default.md            # bundled default retrospective prompt
├── dist/                         # tsup build output (gitignored)
├── docs/
│   └── adr/
├── CONTEXT.md
├── PLAN.md
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## 2. Stack

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node.js | Universal, no extra dep for the end user |
| Language | TypeScript | Interfaces, type safety across the pipeline |
| Build | tsup | Zero-config bundle, single output file |
| CLI parsing | commander | Mature, typed, required-flag enforcement built in |
| Distribution | npm (global install) | `npm install -g retroloop`, available everywhere |
| Runner | `claude` CLI | Already installed and authenticated on dev machine |
| GitHub | `gh` CLI | Already installed and authenticated on dev machine |

---

## 3. Invocation modes

### Hook Mode (automatic)
Claude Code fires `SessionEnd` and writes to stdin:
```json
{
  "session_id": "c45e6165-b736-44b9-93f1-b0cbe12e9ddf",
  "transcript_path": "/Users/user/.claude/projects/<hash>/<session-id>.jsonl",
  "cwd": "/Users/user/dev/my-project",
  "hook_event_name": "SessionEnd",
  "reason": "exit"
}
```
retroloop detects stdin is available, parses the JSON, extracts `session_id`
and `transcript_path` directly. No flags required.

Claude Code hook configuration:
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

### Manual Mode
stdin is empty. `--session-id` is required. retroloop resolves the transcript
path by transforming CWD: replace every `/` with `-`, then look up
`~/.claude/projects/<transformed-cwd>/<session-id>.jsonl`.

Example: CWD `/Users/andreas/projects/bits` → looks in
`~/.claude/projects/-Users-andreas-projects-bits/<session-id>.jsonl`.

---

## 4. Pipeline — step by step

```
stdin? ──yes──▶ parse hook payload ──▶ transcript_path, session_id, cwd
        no  ──▶ require --session-id ──▶ resolve path via CWD transform

[Significance gate]
  format session → count chars
  if chars < --min-session-chars → exit 0 (log: "session too small, skipping")
  if --force → skip gate

[Step 1] Read + format session
  parse <session-id>.jsonl → SessionEvent[]
  embed subagents inline (see §5)
  → FormattedSession (markdown string)

[Step 2] Summarize (conditional)
  if FormattedSession.chars > --summarizer-threshold-chars:
    run `claude -p <summarizer-prompt>` with FormattedSession path
    → SummarizedSession replaces FormattedSession as runner input

[Step 3] Load + interpolate prompt
  load --prompt-file or bundled default.md
  substitute tokens: {{SESSION_ID}}, {{DATE}}, {{PROJECT_NAME}}
  prepend session content (FormattedSession or SummarizedSession)
  → final prompt string

[Step 4] Run
  spawn `claude -p "<final prompt>"` from project CWD
  Runner inherits project .claude/settings.json (tools, MCP, permissions)
  collect stdout → runnerOutput string

[Step 5] Output routing
  always: print runnerOutput to stdout
  if --output-file: write runnerOutput to resolved path
  if --create-issue: call `gh issue create` with runnerOutput as body
```

---

## 5. Subagent embedding

Claude Code stores subagents at:
```
~/.claude/projects/<hash>/<session-id>/subagents/
  agent-<id>.jsonl
  agent-<id>.meta.json       ← { agentType, description, toolUseId }
```

The `toolUseId` in `meta.json` matches a `tool_use.id` in the parent session
transcript. Embedding algorithm:

1. Scan `<session-id>/subagents/` directory (if it exists)
2. Build a map: `toolUseId → subagent transcript`
3. While formatting the parent session, when a `tool_use` event is encountered:
   - check if its `id` exists in the map
   - if yes: render the subagent transcript as a nested Markdown section inline

```markdown
## Turn 14 — Assistant
[invokes Agent: code-reviewer — "Review the auth changes"]

### ⮑ Subagent: code-reviewer
#### Turn 1 — Assistant (subagent)
...
#### Turn N — Final response
...
### ⮑ End subagent: code-reviewer

## Turn 15 — Assistant
[continues with subagent result]
```

---

## 6. Session filtering (what gets included)

To control session size, retroloop applies sensible defaults when rendering:

**Included by default:**
- All user messages
- All assistant text responses
- Tool call names and inputs (truncated at 500 chars)
- Tool outputs that are errors
- Write / Edit / Create file tool calls (full content)

**Excluded by default:**
- Read tool outputs longer than 500 chars (replaced with `[content truncated, N chars]`)
- Bash outputs longer than 500 chars that succeeded (replaced with `[output truncated, N chars]`)
- `thinking` blocks

These limits are not configurable in v1 — keep it simple.

---

## 7. TypeScript interfaces

```typescript
// session/reader.ts
interface SessionEvent {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | string
  uuid: string
  parentUuid: string | null
  timestamp: string
  message: unknown  // raw Anthropic message shape
}

// subagents/embedder.ts
interface SubagentMeta {
  agentType: string
  description: string
  toolUseId: string
}

// session/formatter.ts
interface FormattedSession {
  sessionId: string
  content: string   // full Markdown string
  chars: number
  turnCount: number
}

// prompt/interpolator.ts
interface PromptContext {
  SESSION_ID: string
  DATE: string        // YYYY-MM-DD
  PROJECT_NAME: string  // basename of CWD
}

// runner/claude.ts
interface RunnerOptions {
  prompt: string
  cwd: string
  model?: string      // --model flag value
}

interface RunnerResult {
  stdout: string
  exitCode: number
}

// output/github-issue.ts
interface IssueOptions {
  repo?: string       // owner/repo — auto-detected if absent
  title: string       // interpolated from --github-title template
  labels: string[]    // from --github-labels
  body: string        // runnerOutput
}

// output/file.ts
interface FileOutputOptions {
  pathTemplate: string  // supports {{SESSION_ID}}
  sessionId: string
  content: string
}
```

---

## 8. CLI flags

### Required in Manual Mode, auto-resolved in Hook Mode
| Flag | Description |
|---|---|
| `--session-id <id>` | Session UUID to process |

### Optional — prompt
| Flag | Default | Description |
|---|---|---|
| `--prompt-file <path>` | bundled `default.md` | Path to prompt template |

### Optional — runner
| Flag | Default | Description |
|---|---|---|
| `--model <model>` | claude CLI default | Model for the main runner |

### Optional — summarizer
| Flag | Default | Description |
|---|---|---|
| `--summarizer-model <model>` | `claude-haiku-4-5-20251001` | Model for summarization pass |
| `--summarizer-threshold-chars <n>` | `50000` | Session size above which summarization runs |

### Optional — significance gate
| Flag | Default | Description |
|---|---|---|
| `--min-session-chars <n>` | `1000` | Sessions smaller than this are skipped |
| `--force` | — | Ignore `--min-session-chars` |

### Optional — output
| Flag | Default | Description |
|---|---|---|
| `--output-file <path>` | — | Write runner output to this path. Supports `{{SESSION_ID}}` |
| `--create-issue` | — | Create a GitHub issue with runner output as body |
| `--github-repo <owner/repo>` | auto-detect from `git remote origin` | Target repo for issue |
| `--github-labels <labels>` | `retroloop` | Comma-separated issue labels |
| `--github-title <template>` | `Retro: {{SESSION_ID}} — {{DATE}}` | Issue title template |

---

## 9. Prompt tokens

Available in `--prompt-file` templates and `--github-title`:

| Token | Value |
|---|---|
| `{{SESSION_ID}}` | The session UUID |
| `{{DATE}}` | Today's date, `YYYY-MM-DD` |
| `{{PROJECT_NAME}}` | `basename` of the project CWD |

---

## 10. Output formats

### stdout (always)
Runner output printed as-is to stdout. Composable with pipes.

### `--output-file .retroloop/retros/{{SESSION_ID}}.md`
Runner output written verbatim to the resolved path. Directory created if
it doesn't exist.

### `--create-issue`
Calls:
```bash
gh issue create \
  --repo <repo> \
  --title "<interpolated title>" \
  --label "<labels>" \
  --body "<runnerOutput>"
```
Requires `gh` CLI installed and authenticated. If `--github-repo` is not
passed and auto-detect fails (no git remote, non-GitHub remote, ambiguous
remotes), retroloop exits with a clear error.

---

## 11. Default prompt (bundled)

The bundled `default.md` produces a retrospective structured as Markdown:

```
You are reviewing a Claude Code session transcript. Produce a retrospective
covering:

1. **Summary** — what was accomplished in 2-3 sentences
2. **Friction** — moments where the AI struggled, went in the wrong direction,
   or needed correction. For each: what happened, why it was friction, what a
   better approach would have been.
3. **Decisions** — key architectural or design decisions made
4. **Next steps** — concrete, actionable items that follow from this session

Be specific. Reference actual events from the transcript. Avoid generic advice.

Session transcript:
---
{{SESSION_CONTENT}}
```

(Note: `{{SESSION_CONTENT}}` is replaced by the FormattedSession or
SummarizedSession content at runtime — this is an internal token, not
available in user prompt templates.)

---

## 12. Execution phases

### Phase 1 — MVP (implement first)
**Goal:** hook runs, session is collected with subagents, default prompt
executes, output goes to stdout.

- [ ] `session/reader.ts` — parse `.jsonl` into `SessionEvent[]`
- [ ] `session/formatter.ts` — render to Markdown with filtering rules
- [ ] `subagents/embedder.ts` — embed subagent transcripts inline
- [ ] `session/resolve.ts` — Hook Mode + Manual Mode path resolution
- [ ] `runner/claude.ts` — spawn `claude -p` from CWD
- [ ] `prompt/loader.ts` + `prompt/interpolator.ts` + `prompt/default.md`
- [ ] `index.ts` — commander setup, significance gate, pipeline orchestration
- [ ] Publish to npm

### Phase 2 — Output targets
- [ ] `output/file.ts` — `--output-file` with `{{SESSION_ID}}`
- [ ] `output/github-issue.ts` — `--create-issue` via `gh` CLI
- [ ] `--github-repo` auto-detect + error handling

### Phase 3 — Summarizer
- [ ] `session/summarizer.ts` — summarization pass via cheap model
- [ ] `--summarizer-model` + `--summarizer-threshold-chars` flags
- [ ] Summarizer prompt (bundled, not user-configurable)

### Phase 4 — Polish
- [ ] `--force` flag
- [ ] `--min-session-chars` configurable default
- [ ] Comprehensive error messages (missing `gh`, missing `claude`, no git remote)
- [ ] README + usage examples
