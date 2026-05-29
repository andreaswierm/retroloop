import { basename } from 'node:path'
import type { SessionReader, ReadOptions, ReadResult } from '../types.js'
import { resolveTranscriptPath } from './path-resolver.js'
import { parseTranscript } from './transcript-parser.js'
import {
  extractModel,
  extractCliVersion,
  countTurns,
  formatSessionToMarkdown,
} from './session-formatter.js'
import { loadSubagents } from './subagent-embedder.js'

/**
 * The Claude Code Session Reader.
 * Handles path resolution, transcript parsing, and Markdown formatting
 * for Claude Code `.jsonl` transcripts, with subagent transcripts embedded
 * inline at the point of their `Agent` tool call invocation.
 */
export const claudeSessionReader: SessionReader = {
  provider: 'claude-code',
  flag: '--claude-session-id',

  async read(options: ReadOptions): Promise<ReadResult> {
    const { sessionId, cwd, transcriptPath } = options

    const resolvedPath = resolveTranscriptPath(sessionId, cwd, transcriptPath)
    const events = parseTranscript(resolvedPath)

    const model = extractModel(events)
    const cliVersion = extractCliVersion(events)
    const turnCount = countTurns(events)
    const projectName = basename(cwd)

    // Load and embed subagents inline
    const { rendered: subagentMap, count: subagentCount } = loadSubagents(
      resolvedPath,
      sessionId,
    )

    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const manifest = {
      provider: 'claude-code',
      cliVersion,
      sessionId,
      projectName,
      date,
      model,
      turnCount,
      subagentCount,
      summarized: false,
    }

    const markdown = formatSessionToMarkdown(events, { subagentMap })

    return { manifest, markdown }
  },
}
