import { readFileSync } from 'node:fs'
import type { SessionEvent } from '../types.js'

/**
 * Known control-line types that appear in Claude Code .jsonl transcripts
 * but are not conversation messages. We parse them tolerantly — they are
 * included as SessionEvents with their raw type so callers can ignore or
 * inspect them.
 */
const CONTROL_LINE_TYPES = new Set([
  'mode',
  'permission-mode',
  'file-history-snapshot',
])

/**
 * A raw line from the .jsonl file before validation.
 */
interface RawLine {
  type?: string
  uuid?: string
  parentUuid?: string | null
  timestamp?: string
  message?: unknown
  [key: string]: unknown
}

/**
 * Parses a Claude Code `.jsonl` transcript file into typed `SessionEvent[]`.
 *
 * - Lines that are valid JSON with a recognized shape are parsed into
 *   `SessionEvent` objects.
 * - Control lines (mode, permission-mode, file-history-snapshot, etc.) are
 *   included with their raw `type`.
 * - Malformed / non-JSON lines are silently skipped (tolerant parsing).
 */
export function parseTranscript(filePath: string): SessionEvent[] {
  const content = readFileSync(filePath, 'utf-8')
  return parseTranscriptContent(content)
}

/**
 * Parses raw .jsonl content (string) into typed `SessionEvent[]`.
 * Exported separately for testability without filesystem access.
 */
export function parseTranscriptContent(content: string): SessionEvent[] {
  const events: SessionEvent[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let parsed: RawLine
    try {
      parsed = JSON.parse(trimmed) as RawLine
    } catch {
      // Tolerant: skip non-JSON lines
      continue
    }

    if (typeof parsed !== 'object' || parsed === null) continue

    // All valid events must have a type
    if (typeof parsed.type !== 'string') continue

    const event: SessionEvent = {
      type: parsed.type,
      uuid: typeof parsed.uuid === 'string' ? parsed.uuid : '',
      parentUuid:
        typeof parsed.parentUuid === 'string'
          ? parsed.parentUuid
          : null,
      timestamp:
        typeof parsed.timestamp === 'string' ? parsed.timestamp : '',
      message: parsed.message ?? null,
    }

    events.push(event)
  }

  return events
}

/**
 * Returns true if the event type is a known control line (not a conversation
 * message).
 */
export function isControlLine(type: string): boolean {
  return CONTROL_LINE_TYPES.has(type)
}
