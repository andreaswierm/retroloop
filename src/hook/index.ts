import { readFileSync } from 'node:fs'

/**
 * The JSON payload that Claude Code delivers to stdin when firing a
 * `SessionEnd` hook. retroloop uses this to drive Hook Mode — no flags
 * required from the user.
 *
 * Claude Code `SessionEnd` hook configuration (add to ~/.claude/settings.json):
 *
 * ```json
 * {
 *   "hooks": {
 *     "SessionEnd": [
 *       {
 *         "hooks": [{ "type": "command", "command": "retroloop" }]
 *       }
 *     ]
 *   }
 * }
 * ```
 *
 * When invoked this way, retroloop receives the payload below on stdin and
 * requires zero additional flags to run the full pipeline.
 */
export interface HookPayload {
  session_id: string
  transcript_path: string
  cwd: string
  hook_event_name: string
  reason: string
}

const REQUIRED_FIELDS: Array<keyof HookPayload> = [
  'session_id',
  'transcript_path',
  'cwd',
  'hook_event_name',
  'reason',
]

function isHookPayload(value: unknown): value is HookPayload {
  if (typeof value !== 'object' || value === null) return false
  return REQUIRED_FIELDS.every(
    (field) => typeof (value as Record<string, unknown>)[field] === 'string',
  )
}

/**
 * Attempts to read and parse a `HookPayload` from stdin.
 *
 * Returns the parsed payload when stdin is not a TTY and contains a valid
 * JSON object with all required fields. Returns `null` in all other cases
 * (stdin is a TTY, empty, invalid JSON, or missing required fields).
 */
export function readHookPayload(): HookPayload | null {
  if (process.stdin.isTTY) return null

  try {
    const raw = readFileSync('/dev/stdin', 'utf-8').trim()
    if (raw.length === 0) return null

    const parsed: unknown = JSON.parse(raw)
    if (!isHookPayload(parsed)) return null

    return parsed
  } catch {
    return null
  }
}
