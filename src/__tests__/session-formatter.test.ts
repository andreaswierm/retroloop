import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  extractModel,
  extractCliVersion,
  countTurns,
  formatSessionToMarkdown,
} from '../readers/claude/session-formatter.js'
import { parseTranscriptContent } from '../readers/claude/transcript-parser.js'
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

function loadFixture(name: string): SessionEvent[] {
  const content = readFileSync(
    join(import.meta.dirname, 'fixtures', name),
    'utf-8',
  )
  return parseTranscriptContent(content)
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
            { type: 'thinking', thinking: 'private thoughts' },
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

  it('skips system events for turn numbering but processes tool_result', () => {
    const events: SessionEvent[] = [
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

describe('formatSessionToMarkdown — thinking blocks', () => {
  it('drops thinking blocks and keeps text (fixture)', () => {
    const events = loadFixture('thinking-blocks.jsonl')
    const md = formatSessionToMarkdown(events)
    expect(md).not.toContain('Let me think about this carefully')
    expect(md).toContain('Here is my answer to the hard problem.')
    expect(md).toContain('Solve this hard problem')
  })
})

describe('formatSessionToMarkdown — tool result filtering rules (fixture)', () => {
  let md: string

  // Load once for all subtests
  const events = loadFixture('tool-results-filtering.jsonl')
  md = formatSessionToMarkdown(events)

  it('preserves short Read output in full', () => {
    expect(md).toContain('short content')
  })

  it('replaces long Read output with truncation marker including char count', () => {
    // The long Read output is 510 A's
    expect(md).toContain('[Read output truncated:')
    expect(md).toMatch(/\[Read output truncated: \d+ chars\]/)
    expect(md).not.toContain('AAAAAAAAAAAA')
  })

  it('preserves short Bash output in full', () => {
    expect(md).toContain('hi')
  })

  it('replaces long successful Bash output with truncation marker including char count', () => {
    // The long Bash output is 510 B's
    expect(md).toContain('[Bash output truncated:')
    expect(md).toMatch(/\[Bash output truncated: \d+ chars\]/)
    expect(md).not.toContain('BBBBBBBBBBBB')
  })

  it('preserves error tool results in full', () => {
    expect(md).toContain('bash: failing-cmd: command not found')
    expect(md).toContain('error')
  })

  it('preserves Write tool results in full', () => {
    expect(md).toContain('File written successfully')
  })

  it('preserves Edit tool results in full', () => {
    expect(md).toContain('File edited successfully')
  })

  it('preserves user messages in full', () => {
    expect(md).toContain('Please read a file and run a bash command')
    expect(md).toContain('Thanks!')
  })
})

describe('formatSessionToMarkdown — tool result inline content blocks', () => {
  it('handles tool_result with array content blocks', () => {
    const events: SessionEvent[] = [
      makeEvent({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'echo test' } },
          ],
        },
      }),
      makeEvent({
        type: 'tool_result',
        message: {
          role: 'tool',
          tool_use_id: 'tu-1',
          content: [{ type: 'text', text: 'test output' }],
        },
      }),
    ]
    const md = formatSessionToMarkdown(events)
    expect(md).toContain('test output')
  })

  it('handles tool_result with unknown tool_use_id gracefully', () => {
    const events: SessionEvent[] = [
      makeEvent({
        type: 'tool_result',
        message: {
          role: 'tool',
          tool_use_id: 'tu-unknown',
          content: 'some output',
        },
      }),
    ]
    // Should not throw; renders with unknown tool name
    expect(() => formatSessionToMarkdown(events)).not.toThrow()
    const md = formatSessionToMarkdown(events)
    expect(md).toContain('some output')
  })

  it('handles tool_result with no content gracefully', () => {
    const events: SessionEvent[] = [
      makeEvent({
        type: 'tool_result',
        message: {
          role: 'tool',
          tool_use_id: 'tu-1',
        },
      }),
    ]
    expect(() => formatSessionToMarkdown(events)).not.toThrow()
  })

  it('handles tool_result with is_error true and long content (not truncated)', () => {
    const longError = 'E'.repeat(600)
    const events: SessionEvent[] = [
      makeEvent({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'fail' } },
          ],
        },
      }),
      makeEvent({
        type: 'tool_result',
        message: {
          role: 'tool',
          tool_use_id: 'tu-1',
          is_error: true,
          content: longError,
        },
      }),
    ]
    const md = formatSessionToMarkdown(events)
    // Error output is never truncated
    expect(md).not.toContain('[Bash output truncated:')
    expect(md).toContain(longError)
  })

  it('Write/Edit/Create tool results are never truncated even if long', () => {
    const longOutput = 'W'.repeat(600)
    const events: SessionEvent[] = [
      makeEvent({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Write', input: { file_path: 'f.txt', content: 'hi' } },
          ],
        },
      }),
      makeEvent({
        type: 'tool_result',
        message: {
          role: 'tool',
          tool_use_id: 'tu-1',
          content: longOutput,
        },
      }),
    ]
    const md = formatSessionToMarkdown(events)
    expect(md).toContain(longOutput)
    expect(md).not.toContain('truncated')
  })
})
