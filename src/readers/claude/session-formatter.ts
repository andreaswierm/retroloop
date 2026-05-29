import type { SessionEvent } from '../types.js'
import { isControlLine } from './transcript-parser.js'

/**
 * A parsed content block within a message.
 */
interface ContentBlock {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string | ContentBlock[]
  is_error?: boolean
  [key: string]: unknown
}

/**
 * A raw Anthropic message shape as stored in a SessionEvent.
 */
interface AnthropicMessage {
  role?: string
  content?: string | ContentBlock[]
  is_error?: boolean
  tool_use_id?: string
  [key: string]: unknown
}

/**
 * Hardcoded truncation limit in v1.
 */
const TRUNCATION_LIMIT = 500

/**
 * Tools whose outputs are always included in full (not truncated), regardless
 * of output size. These are file-write operations where seeing the full output
 * matters.
 */
const FULL_OUTPUT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'Create', 'NotebookWrite'])

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
 * Builds a map from tool_use id → tool name by scanning all events.
 * This lets tool_result events know which tool produced them.
 */
function buildToolUseMap(events: SessionEvent[]): Map<string, string> {
  const map = new Map<string, string>()

  for (const event of events) {
    if (event.type !== 'assistant') continue
    const msg = event.message as AnthropicMessage | null
    if (!msg || !Array.isArray(msg.content)) continue

    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
        map.set(block.id, block.name)
      }
    }
  }

  return map
}

/**
 * Renders tool_use content blocks in assistant messages.
 * Tool call inputs are truncated at 500 chars.
 */
function renderToolUseBlock(block: ContentBlock): string {
  const inputStr = JSON.stringify(block.input ?? {})
  const truncated =
    inputStr.length > TRUNCATION_LIMIT
      ? `${inputStr.slice(0, TRUNCATION_LIMIT)}… [truncated]`
      : inputStr
  return `[Tool: ${block.name ?? 'unknown'} — ${truncated}]`
}

/**
 * Applies filtering/truncation rules to tool result content.
 *
 * Rules (PLAN.md §6):
 * - Errors: included in full
 * - Write/Edit/Create file tools: included in full
 * - Read tool output > 500 chars: replaced with truncation marker
 * - Bash tool successful output > 500 chars: replaced with truncation marker
 * - All other tools: included in full
 */
function renderToolResult(
  content: string,
  toolName: string,
  isError: boolean,
): string {
  // Errors are always included in full
  if (isError) {
    return `[Tool result (error): ${content}]`
  }

  // Write/Edit/Create file tools: include in full
  if (FULL_OUTPUT_TOOLS.has(toolName)) {
    return `[Tool result (${toolName}): ${content}]`
  }

  // Read tool: truncate if over 500 chars
  if (toolName === 'Read' || toolName === 'NotebookRead') {
    if (content.length > TRUNCATION_LIMIT) {
      return `[Read output truncated: ${content.length} chars]`
    }
    return `[Tool result (${toolName}): ${content}]`
  }

  // Bash tool: truncate successful output if over 500 chars
  if (toolName === 'Bash') {
    if (content.length > TRUNCATION_LIMIT) {
      return `[Bash output truncated: ${content.length} chars]`
    }
    return `[Tool result (Bash): ${content}]`
  }

  // All other tools: include in full
  return `[Tool result (${toolName}): ${content}]`
}

/**
 * Renders text content from an Anthropic message's content blocks (assistant messages).
 * - thinking blocks are dropped
 * - tool_use blocks are rendered with truncated inputs
 * - when subagentMap is provided, matching tool_use blocks have the subagent
 *   transcript appended inline immediately after the tool call line
 */
function renderAssistantContentWithSubagents(
  content: string | ContentBlock[] | undefined,
  subagentMap?: Map<string, string>,
): string {
  if (!content) return ''

  if (typeof content === 'string') {
    return content
  }

  const parts: string[] = []

  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    } else if (block.type === 'thinking') {
      // Dropped per session filtering rules (PLAN.md §6)
      continue
    } else if (block.type === 'tool_use') {
      parts.push(renderToolUseBlock(block))
      // If this tool_use has a matching subagent, embed it inline
      if (subagentMap && typeof block.id === 'string') {
        const subagentSection = subagentMap.get(block.id)
        if (subagentSection) {
          parts.push(subagentSection)
        }
      }
    }
  }

  return parts.join('\n\n')
}


/**
 * Renders a tool_result event's content using filtering rules.
 */
function renderToolResultEvent(
  msg: AnthropicMessage,
  toolUseMap: Map<string, string>,
): string {
  const toolUseId = msg.tool_use_id
  const toolName = (typeof toolUseId === 'string' ? toolUseMap.get(toolUseId) : undefined) ?? 'unknown'
  const isError = msg.is_error === true

  const raw = msg.content
  let contentStr: string

  if (typeof raw === 'string') {
    contentStr = raw
  } else if (Array.isArray(raw)) {
    // Content blocks in tool results — extract text
    const textParts: string[] = []
    for (const block of raw as ContentBlock[]) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text)
      }
    }
    contentStr = textParts.join('\n')
  } else {
    return ''
  }

  return renderToolResult(contentStr, toolName, isError)
}

/**
 * Options for formatSessionToMarkdown.
 */
export interface FormatOptions {
  /**
   * The Markdown heading level for turn headings (default: 2 → "## Turn N").
   * Subagent transcripts use 4 so their turns nest visually below the parent.
   */
  headingLevel?: number
  /**
   * Optional map from tool_use id → pre-rendered subagent Markdown.
   * When set, tool_use blocks whose id appears in the map will have the
   * subagent section appended inline immediately after the tool call line.
   */
  subagentMap?: Map<string, string>
}

/**
 * Renders a list of SessionEvents into a Markdown body string.
 *
 * Filtering rules applied (PLAN.md §6):
 * - User messages: included in full
 * - Assistant text: included in full
 * - thinking blocks: dropped
 * - tool_use inputs: truncated at 500 chars
 * - tool_result for Read > 500 chars: replaced with "[Read output truncated: N chars]"
 * - tool_result for Bash (success) > 500 chars: replaced with "[Bash output truncated: N chars]"
 * - tool_result that is an error: included in full
 * - tool_result for Write/Edit/Create: included in full
 *
 * When `options.subagentMap` is provided, subagent transcripts are embedded
 * inline at the point of the matching `tool_use` invocation.
 */
export function formatSessionToMarkdown(
  events: SessionEvent[],
  options: FormatOptions = {},
): string {
  const { headingLevel = 2, subagentMap } = options
  const hashes = '#'.repeat(headingLevel)
  const toolUseMap = buildToolUseMap(events)
  const lines: string[] = []
  let turnIndex = 0

  for (const event of events) {
    if (isControlLine(event.type)) continue

    const msg = event.message as AnthropicMessage | null

    if (event.type === 'user' || event.type === 'assistant') {
      turnIndex++
      const role = event.type === 'user' ? 'User' : 'Assistant'
      lines.push(`${hashes} Turn ${turnIndex} — ${role}`)
      lines.push('')

      if (msg) {
        const rendered = renderAssistantContentWithSubagents(
          msg.content,
          subagentMap,
        )
        if (rendered.trim()) {
          lines.push(rendered)
          lines.push('')
        }
      }
    } else if (event.type === 'tool_result') {
      if (msg) {
        const rendered = renderToolResultEvent(msg, toolUseMap)
        if (rendered.trim()) {
          lines.push(rendered)
          lines.push('')
        }
      }
    }
  }

  return lines.join('\n')
}
