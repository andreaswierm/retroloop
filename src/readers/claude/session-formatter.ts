import type { SessionEvent } from '../types.js'
import { isControlLine } from './transcript-parser.js'

/**
 * A parsed content block within a message.
 */
interface ContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string | ContentBlock[]
  [key: string]: unknown
}

/**
 * A raw Anthropic message shape as stored in a SessionEvent.
 */
interface AnthropicMessage {
  role?: string
  content?: string | ContentBlock[]
  [key: string]: unknown
}

/**
 * Extracts the model from transcript events.
 * Claude Code typically stores model info in assistant messages.
 */
export function extractModel(events: SessionEvent[]): string | undefined {
  for (const event of events) {
    const msg = event.message as Record<string, unknown> | null
    if (!msg) continue
    if (typeof msg.model === 'string' && msg.model) {
      return msg.model
    }
  }
  return undefined
}

/**
 * Extracts the CLI version from transcript events.
 * Some Claude Code sessions include a `cliVersion` field in system messages.
 */
export function extractCliVersion(events: SessionEvent[]): string | undefined {
  for (const event of events) {
    const msg = event.message as Record<string, unknown> | null
    if (!msg) continue
    if (typeof msg.cliVersion === 'string' && msg.cliVersion) {
      return msg.cliVersion
    }
    if (typeof msg.cli_version === 'string' && msg.cli_version) {
      return msg.cli_version
    }
  }
  return undefined
}

/**
 * Counts conversation turns (user + assistant messages, excluding control lines).
 */
export function countTurns(events: SessionEvent[]): number {
  return events.filter(
    (e) => (e.type === 'user' || e.type === 'assistant') && !isControlLine(e.type),
  ).length
}

/**
 * Renders text content from an Anthropic message's content blocks.
 */
function renderContent(content: string | ContentBlock[] | undefined): string {
  if (!content) return ''

  if (typeof content === 'string') {
    return content
  }

  const parts: string[] = []

  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    } else if (block.type === 'thinking') {
      // Excluded per session filtering rules (PLAN.md §6)
      continue
    } else if (block.type === 'tool_use') {
      const inputStr = JSON.stringify(block.input ?? {})
      const truncated =
        inputStr.length > 500 ? `${inputStr.slice(0, 500)}… [truncated]` : inputStr
      parts.push(`[Tool: ${block.name ?? 'unknown'} — ${truncated}]`)
    } else if (block.type === 'tool_result') {
      const resultContent = block.content
      if (typeof resultContent === 'string') {
        parts.push(`[Tool result: ${resultContent.slice(0, 500)}${resultContent.length > 500 ? '… [truncated]' : ''}]`)
      }
    }
  }

  return parts.join('\n\n')
}

/**
 * Renders a list of SessionEvents into a Markdown body string.
 * Control lines are skipped. User and assistant turns are rendered as
 * numbered Markdown sections.
 */
export function formatSessionToMarkdown(events: SessionEvent[]): string {
  const lines: string[] = []
  let turnIndex = 0

  for (const event of events) {
    if (isControlLine(event.type)) continue
    if (event.type !== 'user' && event.type !== 'assistant') continue

    turnIndex++
    const role = event.type === 'user' ? 'User' : 'Assistant'
    lines.push(`## Turn ${turnIndex} — ${role}`)
    lines.push('')

    const msg = event.message as AnthropicMessage | null
    if (msg) {
      const rendered = renderContent(msg.content)
      if (rendered.trim()) {
        lines.push(rendered)
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}
