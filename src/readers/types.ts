/**
 * A single event parsed from a Claude Code .jsonl transcript file.
 * The `type` field reflects the role/event kind (user, assistant, tool_use,
 * tool_result, system, or provider-specific control lines).
 */
export interface SessionEvent {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | string
  uuid: string
  parentUuid: string | null
  timestamp: string
  message: unknown
}

/**
 * Structured metadata produced by a Session Reader.
 * `summarized` is set by the pipeline after the Summarizer step.
 */
export interface SessionManifest {
  provider: string
  cliVersion?: string
  sessionId: string
  projectName: string
  date: string        // YYYY-MM-DD
  model?: string
  turnCount: number
  subagentCount: number
  summarized: boolean
}

/**
 * The result returned by a Session Reader's `read()` method.
 * `manifest` carries structured metadata; `markdown` is the rendered body.
 */
export interface ReadResult {
  manifest: SessionManifest
  markdown: string
}

/**
 * Options passed into a Session Reader's `read()` method.
 */
export interface ReadOptions {
  sessionId: string
  cwd: string
  transcriptPath?: string
}

/**
 * The Session Reader interface — the core expansion seam for adding
 * new AI CLI providers. Each reader owns parsing + formatting for its
 * provider.
 */
export interface SessionReader {
  /** Human-readable provider identifier, e.g. "claude-code" */
  provider: string
  /** The CLI flag that selects this reader, e.g. "--claude-session-id" */
  flag: string
  /** Locate, parse, and format a session transcript into manifest + markdown. */
  read(options: ReadOptions): Promise<ReadResult>
}
