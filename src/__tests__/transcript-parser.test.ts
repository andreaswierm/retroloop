import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { parseTranscript, parseTranscriptContent, isControlLine } from '../readers/claude/transcript-parser.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES = join(__dirname, 'fixtures')

describe('parseTranscriptContent', () => {
  it('parses a simple .jsonl string into SessionEvent[]', () => {
    const content = [
      JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2024-01-01T00:00:00Z', message: { role: 'user', content: 'Hello' } }),
      JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2024-01-01T00:00:01Z', message: { role: 'assistant', content: 'Hi' } }),
    ].join('\n')

    const events = parseTranscriptContent(content)
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('user')
    expect(events[0].uuid).toBe('u1')
    expect(events[0].parentUuid).toBeNull()
    expect(events[1].type).toBe('assistant')
    expect(events[1].parentUuid).toBe('u1')
  })

  it('tolerates non-JSON lines (skips them silently)', () => {
    const content = [
      JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2024-01-01T00:00:00Z', message: null }),
      'not valid json at all',
      '{"broken: json}',
      JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2024-01-01T00:00:01Z', message: null }),
    ].join('\n')

    const events = parseTranscriptContent(content)
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('user')
    expect(events[1].type).toBe('assistant')
  })

  it('tolerates lines without a type field (skips them)', () => {
    const content = [
      JSON.stringify({ uuid: 'x1', message: 'no type here' }),
      JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2024-01-01T00:00:00Z', message: null }),
    ].join('\n')

    const events = parseTranscriptContent(content)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('user')
  })

  it('skips empty lines', () => {
    const content = '\n\n' +
      JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2024-01-01T00:00:00Z', message: null }) +
      '\n\n'

    const events = parseTranscriptContent(content)
    expect(events).toHaveLength(1)
  })

  it('includes control-line types (mode, permission-mode, file-history-snapshot)', () => {
    const content = [
      JSON.stringify({ type: 'mode', uuid: 'm1', parentUuid: null, timestamp: '2024-01-01T00:00:00Z', message: { mode: 'auto' } }),
      JSON.stringify({ type: 'permission-mode', uuid: 'p1', parentUuid: null, timestamp: '2024-01-01T00:00:01Z', message: {} }),
      JSON.stringify({ type: 'file-history-snapshot', uuid: 'f1', parentUuid: null, timestamp: '2024-01-01T00:00:02Z', message: {} }),
    ].join('\n')

    const events = parseTranscriptContent(content)
    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('mode')
    expect(events[1].type).toBe('permission-mode')
    expect(events[2].type).toBe('file-history-snapshot')
  })

  it('handles events with missing optional fields gracefully', () => {
    const content = JSON.stringify({ type: 'user' })
    const events = parseTranscriptContent(content)
    expect(events).toHaveLength(1)
    expect(events[0].uuid).toBe('')
    expect(events[0].parentUuid).toBeNull()
    expect(events[0].timestamp).toBe('')
    expect(events[0].message).toBeNull()
  })
})

describe('parseTranscript (from file)', () => {
  it('parses the simple-session fixture correctly', () => {
    const events = parseTranscript(join(FIXTURES, 'simple-session.jsonl'))
    // system + mode + permission-mode + 2 user + 2 assistant = 7
    expect(events.length).toBe(7)
    expect(events.some((e) => e.type === 'user')).toBe(true)
    expect(events.some((e) => e.type === 'assistant')).toBe(true)
    expect(events.some((e) => e.type === 'mode')).toBe(true)
  })

  it('parses the malformed-lines fixture, skipping bad lines', () => {
    const events = parseTranscript(join(FIXTURES, 'malformed-lines.jsonl'))
    // user-001, asst-001 are valid; non-JSON lines and missing-type line skipped
    expect(events.length).toBe(2)
    expect(events[0].type).toBe('user')
    expect(events[1].type).toBe('assistant')
  })

  it('parses the with-tool-use fixture', () => {
    const events = parseTranscript(join(FIXTURES, 'with-tool-use.jsonl'))
    expect(events.length).toBe(4)
    expect(events.some((e) => e.type === 'tool_result')).toBe(true)
  })
})

describe('isControlLine', () => {
  it('returns true for known control line types', () => {
    expect(isControlLine('mode')).toBe(true)
    expect(isControlLine('permission-mode')).toBe(true)
    expect(isControlLine('file-history-snapshot')).toBe(true)
  })

  it('returns false for conversation event types', () => {
    expect(isControlLine('user')).toBe(false)
    expect(isControlLine('assistant')).toBe(false)
    expect(isControlLine('tool_use')).toBe(false)
    expect(isControlLine('tool_result')).toBe(false)
    expect(isControlLine('system')).toBe(false)
  })

  it('returns false for unknown types', () => {
    expect(isControlLine('whatever')).toBe(false)
  })
})
