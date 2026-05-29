import { describe, it, expect } from 'vitest'
import {
  extractModel,
  extractCliVersion,
  countTurns,
  formatSessionToMarkdown,
} from '../readers/claude/session-formatter.js'
import type { SessionEvent } from '../readers/types.js'

function makeEvent(overrides: Partial<SessionEvent>): SessionEvent {
  return {
    type: 'user',
    uuid: 'u1',
    parentUuid: null,
    timestamp: '2024-01-01T00:00:00Z',
    message: null,
    ...overrides,
  }
}

describe('extractModel', () => {
  it('extracts the model from an assistant message', () => {
    const events: SessionEvent[] = [
      makeEvent({
        type: 'assistant',
        message: { role: 'assistant', content: [], model: 'claude-opus-4-5' },
      }),
    ]
    expect(extractModel(events)).toBe('claude-opus-4-5')
  })

  it('returns undefined when no model is present', () => {
    const events: SessionEvent[] = [
      makeEvent({ type: 'user', message: { role: 'user', content: 'hello' } }),
    ]
    expect(extractModel(events)).toBeUndefined()
  })

  it('returns the first model found', () => {
    const events: SessionEvent[] = [
      makeEvent({ type: 'assistant', message: { model: 'first-model' } }),
      makeEvent({ type: 'assistant', message: { model: 'second-model' } }),
    ]
    expect(extractModel(events)).toBe('first-model')
  })
})

describe('extractCliVersion', () => {
  it('extracts cliVersion from a system message', () => {
    const events: SessionEvent[] = [
      makeEvent({
        type: 'system',
        message: { cliVersion: '1.2.3' },
      }),
    ]
    expect(extractCliVersion(events)).toBe('1.2.3')
  })

  it('extracts cli_version (underscore variant)', () => {
    const events: SessionEvent[] = [
      makeEvent({
        type: 'system',
        message: { cli_version: '2.0.0' },
      }),
    ]
    expect(extractCliVersion(events)).toBe('2.0.0')
  })

  it('returns undefined when not present', () => {
    const events: SessionEvent[] = [
      makeEvent({ type: 'user', message: null }),
    ]
    expect(extractCliVersion(events)).toBeUndefined()
  })
})

describe('countTurns', () => {
  it('counts user and assistant turns only', () => {
    const events: SessionEvent[] = [
      makeEvent({ type: 'mode' }),
      makeEvent({ type: 'user' }),
      makeEvent({ type: 'assistant' }),
      makeEvent({ type: 'tool_result' }),
      makeEvent({ type: 'user' }),
    ]
    expect(countTurns(events)).toBe(3)
  })

  it('returns 0 for an empty event list', () => {
    expect(countTurns([])).toBe(0)
  })

  it('does not count control lines', () => {
    const events: SessionEvent[] = [
      makeEvent({ type: 'mode' }),
      makeEvent({ type: 'permission-mode' }),
      makeEvent({ type: 'file-history-snapshot' }),
    ]
    expect(countTurns(events)).toBe(0)
  })
})

describe('formatSessionToMarkdown', () => {
  it('renders user and assistant turns with headings', () => {
    const events: SessionEvent[] = [
      makeEvent({
        type: 'user',
        message: { role: 'user', content: 'Hello!' },
      }),
      makeEvent({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there!' }],
        },
      }),
    ]
    const md = formatSessionToMarkdown(events)
    expect(md).toContain('## Turn 1 — User')
    expect(md).toContain('Hello!')
    expect(md).toContain('## Turn 2 — Assistant')
    expect(md).toContain('Hi there!')
  })

  it('skips control lines', () => {
    const events: SessionEvent[] = [
      makeEvent({ type: 'mode', message: { mode: 'auto' } }),
      makeEvent({
        type: 'user',
        message: { role: 'user', content: 'Only user turn' },
      }),
    ]
    const md = formatSessionToMarkdown(events)
    expect(md).toContain('## Turn 1 — User')
    expect(md).not.toContain('Turn 2')
  })

  it('skips thinking blocks', () => {
    const events: SessionEvent[] = [
      makeEvent({
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', text: 'private thoughts' },
            { type: 'text', text: 'public response' },
          ],
        },
      }),
    ]
    const md = formatSessionToMarkdown(events)
    expect(md).not.toContain('private thoughts')
    expect(md).toContain('public response')
  })

  it('renders tool_use blocks with name and input', () => {
    const events: SessionEvent[] = [
      makeEvent({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: 'README.md' } },
          ],
        },
      }),
    ]
    const md = formatSessionToMarkdown(events)
    expect(md).toContain('[Tool: Read')
    expect(md).toContain('README.md')
  })

  it('truncates tool_use input at 500 chars', () => {
    const longInput = 'x'.repeat(600)
    const events: SessionEvent[] = [
      makeEvent({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Write', input: { content: longInput } },
          ],
        },
      }),
    ]
    const md = formatSessionToMarkdown(events)
    expect(md).toContain('[truncated]')
  })

  it('returns empty string for empty event list', () => {
    expect(formatSessionToMarkdown([])).toBe('')
  })

  it('handles string content in user messages', () => {
    const events: SessionEvent[] = [
      makeEvent({
        type: 'user',
        message: { content: 'Simple string content' },
      }),
    ]
    const md = formatSessionToMarkdown(events)
    expect(md).toContain('Simple string content')
  })

  it('skips tool_result and system events', () => {
    const events: SessionEvent[] = [
      makeEvent({ type: 'tool_result', message: { content: 'some result' } }),
      makeEvent({ type: 'system', message: { content: 'system info' } }),
      makeEvent({
        type: 'user',
        message: { content: 'actual turn' },
      }),
    ]
    const md = formatSessionToMarkdown(events)
    expect(md).toContain('## Turn 1 — User')
    expect(md).not.toContain('Turn 2')
  })
})
