import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parseTranscriptContent } from './transcript-parser.js'
import { formatSessionToMarkdown } from './session-formatter.js'
import type { SessionEvent } from '../types.js'

/**
 * Metadata stored in a subagent's companion `.meta.json` file.
 */
export interface SubagentMeta {
  agentType: string
  description: string
  toolUseId: string
}

/**
 * A loaded subagent with its parsed transcript events and metadata.
 */
export interface LoadedSubagent {
  id: string
  meta: SubagentMeta
  events: SessionEvent[]
}

/**
 * Result of scanning and loading subagents.
 */
export interface SubagentMap {
  /** Map from toolUseId → rendered Markdown for that subagent */
  rendered: Map<string, string>
  /** Total number of subagents loaded (including orphans) */
  count: number
}

/**
 * Scans the subagents directory for a given session, parses each subagent's
 * transcript and meta.json, and returns a map of toolUseId → rendered Markdown.
 *
 * The subagents directory is located at:
 *   <parent-dir-of-session-file>/<session-id>/subagents/
 *
 * For example, if the main session is at:
 *   ~/.claude/projects/<hash>/<session-id>.jsonl
 * then subagents are at:
 *   ~/.claude/projects/<hash>/<session-id>/subagents/
 *
 * Orphaned subagents (those whose toolUseId does not appear in the main
 * session's tool_use events) are still counted but their rendered Markdown
 * is keyed to their toolUseId — the caller decides whether to embed them.
 *
 * A missing subagents directory is handled gracefully (returns empty map,
 * count 0).
 */
export function loadSubagents(
  transcriptFilePath: string,
  sessionId: string,
): SubagentMap {
  // transcriptFilePath: ~/.claude/projects/<hash>/<session-id>.jsonl
  // subagentsDir:       ~/.claude/projects/<hash>/<session-id>/subagents/
  const projectDir = join(transcriptFilePath, '..') // ~/.claude/projects/<hash>/
  const subagentsDir = join(projectDir, sessionId, 'subagents')

  const rendered = new Map<string, string>()

  if (!existsSync(subagentsDir)) {
    return { rendered, count: 0 }
  }

  let entries: string[]
  try {
    entries = readdirSync(subagentsDir)
  } catch {
    // Unreadable directory — treat as absent
    return { rendered, count: 0 }
  }

  // Find all agent-<id>.meta.json files
  const metaFiles = entries.filter((f) => f.endsWith('.meta.json'))

  for (const metaFile of metaFiles) {
    const agentId = basename(metaFile, '.meta.json') // e.g. "agent-abc"
    const transcriptFile = `${agentId}.jsonl`

    const metaPath = join(subagentsDir, metaFile)
    const transcriptPath = join(subagentsDir, transcriptFile)

    // Parse meta
    let meta: SubagentMeta
    try {
      const raw = readFileSync(metaPath, 'utf-8')
      meta = JSON.parse(raw) as SubagentMeta
    } catch {
      // Skip malformed meta
      continue
    }

    if (
      typeof meta.toolUseId !== 'string' ||
      typeof meta.agentType !== 'string' ||
      typeof meta.description !== 'string'
    ) {
      // Skip if required fields are missing
      continue
    }

    // Parse transcript (if present)
    let subagentMarkdown: string
    if (existsSync(transcriptPath)) {
      try {
        const content = readFileSync(transcriptPath, 'utf-8')
        const events = parseTranscriptContent(content)
        subagentMarkdown = renderSubagentMarkdown(meta, events)
      } catch {
        // Fallback: render stub with just description
        subagentMarkdown = renderSubagentStub(meta)
      }
    } else {
      // No transcript file — render a stub
      subagentMarkdown = renderSubagentStub(meta)
    }

    rendered.set(meta.toolUseId, subagentMarkdown)
  }

  return { rendered, count: rendered.size }
}

/**
 * Renders a subagent's transcript as a nested Markdown section.
 * Heading levels are shifted down by 2 (## → ####) so that the subagent
 * section nests visually below the parent turn's ## heading.
 */
function renderSubagentMarkdown(meta: SubagentMeta, events: SessionEvent[]): string {
  const body = formatSessionToMarkdown(events, { headingLevel: 4 })
  const lines: string[] = []
  lines.push(`### ⮑ Subagent: ${meta.agentType} — "${meta.description}"`)
  lines.push('')
  if (body.trim()) {
    lines.push(body)
  }
  lines.push(`### ⮑ End subagent: ${meta.agentType}`)
  lines.push('')
  return lines.join('\n')
}

/**
 * Renders a minimal subagent section when no transcript is available.
 */
function renderSubagentStub(meta: SubagentMeta): string {
  const lines: string[] = []
  lines.push(`### ⮑ Subagent: ${meta.agentType} — "${meta.description}"`)
  lines.push('')
  lines.push('_[No transcript available]_')
  lines.push('')
  lines.push(`### ⮑ End subagent: ${meta.agentType}`)
  lines.push('')
  return lines.join('\n')
}
