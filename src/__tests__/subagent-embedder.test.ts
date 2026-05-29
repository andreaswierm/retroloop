import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { join } from 'node:path'

// Path to the fixtures directory
const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')
const SUBAGENT_FIXTURES_DIR = join(FIXTURES_DIR, 'subagents')

// ── Mock node:fs so we can control filesystem access ──────────────────────
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
  }
})

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { loadSubagents } from '../readers/claude/subagent-embedder.js'
import { formatSessionToMarkdown } from '../readers/claude/session-formatter.js'
import { parseTranscriptContent } from '../readers/claude/transcript-parser.js'

const mockExistsSync = vi.mocked(existsSync)
const mockReaddirSync = vi.mocked(readdirSync)
const mockReadFileSync = vi.mocked(readFileSync)

// Real fs functions obtained through importActual (not affected by the mock)
let realFs: typeof import('node:fs')

beforeAll(async () => {
  realFs = await vi.importActual<typeof import('node:fs')>('node:fs')
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('loadSubagents — no subagents directory', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(false)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns empty map and count 0 when subagents dir does not exist', () => {
    const result = loadSubagents('/path/to/projects/hash/session-id.jsonl', 'session-id')
    expect(result.count).toBe(0)
    expect(result.rendered.size).toBe(0)
  })

  it('does not throw when subagents directory is missing', () => {
    expect(() =>
      loadSubagents('/path/to/session.jsonl', 'my-session'),
    ).not.toThrow()
  })
})

describe('loadSubagents — with real fixture files', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('loads matched and orphan subagents from the fixture directory', () => {
    // Use the real filesystem for this integration-style test
    mockExistsSync.mockImplementation((p) => realFs.existsSync(p as string))
    mockReaddirSync.mockImplementation((p) => realFs.readdirSync(p as string) as ReturnType<typeof readdirSync>)
    mockReadFileSync.mockImplementation((...args) =>
      realFs.readFileSync(...(args as Parameters<typeof realFs.readFileSync>)) as ReturnType<typeof readFileSync>,
    )

    // The main session is at: <SUBAGENT_FIXTURES_DIR>/main-with-agent-call.jsonl
    // subagents dir is at:    <SUBAGENT_FIXTURES_DIR>/subagents/ (i.e. same name as session-id)
    // We pass session-id = "subagents" so the computed path is:
    //   join(<SUBAGENT_FIXTURES_DIR>, 'subagents', 'subagents') → but we want
    //   join(parent-of-transcript, sessionId, 'subagents')
    // transcript = join(SUBAGENT_FIXTURES_DIR, 'main-with-agent-call.jsonl')
    // parent     = SUBAGENT_FIXTURES_DIR
    // subagentsDir = join(SUBAGENT_FIXTURES_DIR, sessionId, 'subagents')
    // We want sessionId to be '' so subagentsDir = join(SUBAGENT_FIXTURES_DIR, '', 'subagents')
    //   = join(SUBAGENT_FIXTURES_DIR, 'subagents')  ✓
    const result = loadSubagents(
      join(SUBAGENT_FIXTURES_DIR, 'main-with-agent-call.jsonl'),
      '',
    )

    // Both agent-abc and agent-orphan should be loaded
    expect(result.count).toBe(2)
    expect(result.rendered.has('tool-use-abc')).toBe(true)
    expect(result.rendered.has('tool-use-no-match')).toBe(true)
  })
})

describe('loadSubagents — unit tests with mocked fs', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('builds correct toolUseId → rendered markdown mapping', () => {
    const metaJson = JSON.stringify({
      agentType: 'code-reviewer',
      description: 'Review auth changes',
      toolUseId: 'tool-abc',
    })
    const transcriptContent = [
      JSON.stringify({
        type: 'user',
        uuid: 'u1',
        parentUuid: null,
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Review this.' },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'a1',
        parentUuid: 'u1',
        timestamp: '2024-01-01T00:00:01Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'LGTM!' }],
          model: 'claude-haiku',
        },
      }),
    ].join('\n')

    // existsSync: subagents dir exists, transcript exists
    mockExistsSync.mockImplementation((p) => {
      const ps = p as string
      return ps.endsWith('subagents') || ps.endsWith('agent-test.jsonl')
    })
    mockReaddirSync.mockReturnValue(['agent-test.meta.json'] as unknown as ReturnType<typeof readdirSync>)
    mockReadFileSync.mockImplementation((p) => {
      const ps = p as string
      if (ps.endsWith('agent-test.meta.json')) return metaJson
      if (ps.endsWith('agent-test.jsonl')) return transcriptContent
      return ''
    })

    const result = loadSubagents('/some/hash/session.jsonl', 'session')
    expect(result.count).toBe(1)
    expect(result.rendered.has('tool-abc')).toBe(true)

    const section = result.rendered.get('tool-abc')!
    expect(section).toContain('### ⮑ Subagent: code-reviewer')
    expect(section).toContain('Review auth changes')
    expect(section).toContain('LGTM!')
    expect(section).toContain('### ⮑ End subagent: code-reviewer')
  })

  it('renders a stub when transcript file is missing', () => {
    const metaJson = JSON.stringify({
      agentType: 'linter',
      description: 'Lint the code',
      toolUseId: 'tool-lint',
    })

    // existsSync: subagents dir exists, transcript does NOT exist
    mockExistsSync.mockImplementation((p) => {
      const ps = p as string
      if (ps.endsWith('subagents')) return true
      if (ps.endsWith('.jsonl')) return false
      return false
    })
    mockReaddirSync.mockReturnValue(['agent-lint.meta.json'] as unknown as ReturnType<typeof readdirSync>)
    mockReadFileSync.mockImplementation((p) => {
      const ps = p as string
      if (ps.endsWith('agent-lint.meta.json')) return metaJson
      return ''
    })

    const result = loadSubagents('/some/hash/session.jsonl', 'session')
    expect(result.count).toBe(1)
    const section = result.rendered.get('tool-lint')!
    expect(section).toContain('### ⮑ Subagent: linter')
    expect(section).toContain('[No transcript available]')
    expect(section).toContain('### ⮑ End subagent: linter')
  })

  it('skips meta files with missing required fields', () => {
    const badMeta = JSON.stringify({ agentType: 'foo' }) // missing description and toolUseId

    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['agent-bad.meta.json'] as unknown as ReturnType<typeof readdirSync>)
    mockReadFileSync.mockImplementation(() => badMeta)

    const result = loadSubagents('/some/hash/session.jsonl', 'session')
    expect(result.count).toBe(0)
  })

  it('skips meta files with malformed JSON', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['agent-malformed.meta.json'] as unknown as ReturnType<typeof readdirSync>)
    mockReadFileSync.mockImplementation(() => 'not valid json{{{')

    const result = loadSubagents('/some/hash/session.jsonl', 'session')
    expect(result.count).toBe(0)
  })

  it('handles a readdirSync error gracefully', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockImplementation(() => {
      throw new Error('Permission denied')
    })

    expect(() => loadSubagents('/some/hash/session.jsonl', 'session')).not.toThrow()
    const result = loadSubagents('/some/hash/session.jsonl', 'session')
    expect(result.count).toBe(0)
  })

  it('skips non-meta-json entries in the directory', () => {
    const metaJson = JSON.stringify({
      agentType: 'tester',
      description: 'Test something',
      toolUseId: 'tool-test',
    })
    const transcriptContent = JSON.stringify({
      type: 'user',
      uuid: 'u1',
      parentUuid: null,
      timestamp: '2024-01-01T00:00:00Z',
      message: { role: 'user', content: 'Test.' },
    })

    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([
      'README.txt',
      'agent-tester.jsonl',
      'agent-tester.meta.json',
    ] as unknown as ReturnType<typeof readdirSync>)
    mockReadFileSync.mockImplementation((p) => {
      const ps = p as string
      if (ps.endsWith('agent-tester.meta.json')) return metaJson
      if (ps.endsWith('agent-tester.jsonl')) return transcriptContent
      return ''
    })

    const result = loadSubagents('/some/hash/session.jsonl', 'session')
    // Only the one valid .meta.json entry should be counted
    expect(result.count).toBe(1)
  })
})

describe('formatSessionToMarkdown — subagent inline embedding', () => {
  it('embeds matched subagent inline at the tool_use invocation point', () => {
    const events = parseTranscriptContent(
      [
        JSON.stringify({
          type: 'user',
          uuid: 'u1',
          parentUuid: null,
          timestamp: '2024-01-01T00:00:00Z',
          message: { role: 'user', content: 'Use a subagent.' },
        }),
        JSON.stringify({
          type: 'assistant',
          uuid: 'a1',
          parentUuid: 'u1',
          timestamp: '2024-01-01T00:00:01Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Launching subagent.' },
              {
                type: 'tool_use',
                id: 'tool-use-123',
                name: 'Agent',
                input: { description: 'Do the task', agentType: 'worker' },
              },
            ],
            model: 'claude-opus-4-5',
          },
        }),
      ].join('\n'),
    )

    const subagentMap = new Map([
      ['tool-use-123', '### ⮑ Subagent: worker — "Do the task"\n\n_content_\n\n### ⮑ End subagent: worker\n\n'],
    ])

    const md = formatSessionToMarkdown(events, { subagentMap })

    expect(md).toContain('Launching subagent.')
    expect(md).toContain('[Tool: Agent')
    expect(md).toContain('### ⮑ Subagent: worker')
    expect(md).toContain('### ⮑ End subagent: worker')
    // The subagent section appears after the tool_use line
    const toolUseIndex = md.indexOf('[Tool: Agent')
    const subagentIndex = md.indexOf('### ⮑ Subagent: worker')
    expect(subagentIndex).toBeGreaterThan(toolUseIndex)
  })

  it('does not embed subagent for tool_use ids that are not in the map', () => {
    const events = parseTranscriptContent(
      JSON.stringify({
        type: 'assistant',
        uuid: 'a1',
        parentUuid: null,
        timestamp: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-use-unmatched',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
          model: 'claude-opus-4-5',
        },
      }),
    )

    const subagentMap = new Map([
      ['tool-use-other', '### ⮑ Subagent: other\n\n### ⮑ End subagent: other\n\n'],
    ])

    const md = formatSessionToMarkdown(events, { subagentMap })
    expect(md).toContain('[Tool: Bash')
    expect(md).not.toContain('### ⮑ Subagent')
  })

  it('formats without error when subagentMap is undefined (no subagents)', () => {
    const events = parseTranscriptContent(
      JSON.stringify({
        type: 'user',
        uuid: 'u1',
        parentUuid: null,
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Hello' },
      }),
    )

    expect(() => formatSessionToMarkdown(events)).not.toThrow()
    const md = formatSessionToMarkdown(events)
    expect(md).toContain('Hello')
  })

  it('uses headingLevel option to shift heading depth', () => {
    const events = parseTranscriptContent(
      JSON.stringify({
        type: 'user',
        uuid: 'u1',
        parentUuid: null,
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Hello' },
      }),
    )

    const md = formatSessionToMarkdown(events, { headingLevel: 4 })
    expect(md).toContain('#### Turn 1 — User')
    // Ensure the level-2 heading form is NOT present (only #### is used)
    expect(md).not.toMatch(/^## Turn/m)
  })
})

describe('subagent embedding — orphan handling', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('orphaned subagent entries are in the rendered map but not embedded in main session', () => {
    // Orphan: toolUseId that does not appear in main session events
    const metaJson = JSON.stringify({
      agentType: 'orphan-type',
      description: 'Orphan subagent',
      toolUseId: 'no-matching-tool-use',
    })
    const transcriptContent = JSON.stringify({
      type: 'user',
      uuid: 'u1',
      parentUuid: null,
      timestamp: '2024-01-01T00:00:00Z',
      message: { role: 'user', content: 'Orphan task.' },
    })

    mockExistsSync.mockImplementation((p) => {
      const ps = p as string
      return ps.endsWith('subagents') || ps.endsWith('agent-orphan.jsonl')
    })
    mockReaddirSync.mockReturnValue(['agent-orphan.meta.json'] as unknown as ReturnType<typeof readdirSync>)
    mockReadFileSync.mockImplementation((p) => {
      const ps = p as string
      if (ps.endsWith('agent-orphan.meta.json')) return metaJson
      if (ps.endsWith('agent-orphan.jsonl')) return transcriptContent
      return ''
    })

    const { rendered, count } = loadSubagents('/some/hash/session.jsonl', 'session')
    expect(count).toBe(1)
    expect(rendered.has('no-matching-tool-use')).toBe(true)

    // Main session has NO Agent tool call with id 'no-matching-tool-use'
    const mainEvents = parseTranscriptContent(
      JSON.stringify({
        type: 'assistant',
        uuid: 'a1',
        parentUuid: null,
        timestamp: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'some-other-id',
              name: 'Bash',
              input: { command: 'echo hi' },
            },
          ],
          model: 'claude-opus-4-5',
        },
      }),
    )

    const md = formatSessionToMarkdown(mainEvents, { subagentMap: rendered })
    // Orphan subagent should NOT appear in the formatted session
    expect(md).not.toContain('### ⮑ Subagent: orphan-type')
    // The normal tool use should still be rendered
    expect(md).toContain('[Tool: Bash')
  })
})

describe('subagent embedding — integration with real fixtures', () => {
  it('formats main session with embedded subagent using real fixture files', () => {
    // Use the real filesystem for this test
    mockExistsSync.mockImplementation((p) => realFs.existsSync(p as string))
    mockReaddirSync.mockImplementation((p) => realFs.readdirSync(p as string) as ReturnType<typeof readdirSync>)
    mockReadFileSync.mockImplementation((...args) =>
      realFs.readFileSync(...(args as Parameters<typeof realFs.readFileSync>)) as ReturnType<typeof readFileSync>,
    )

    // Load main session transcript
    const mainContent = realFs.readFileSync(join(SUBAGENT_FIXTURES_DIR, 'main-with-agent-call.jsonl'), 'utf-8')
    const mainEvents = parseTranscriptContent(mainContent)

    // Load subagents (sessionId='' so subagentsDir = SUBAGENT_FIXTURES_DIR/subagents)
    const { rendered: subagentMap, count } = loadSubagents(
      join(SUBAGENT_FIXTURES_DIR, 'main-with-agent-call.jsonl'),
      '',
    )

    // There are 2 subagents (agent-abc and agent-orphan)
    expect(count).toBe(2)

    const md = formatSessionToMarkdown(mainEvents, { subagentMap })

    // The matched subagent (agent-abc, toolUseId=tool-use-abc) should be embedded
    expect(md).toContain('### ⮑ Subagent: code-reviewer')
    expect(md).toContain('I\'ll carefully review the authentication changes.')
    expect(md).toContain('The changes look secure and well-tested. LGTM.')
    expect(md).toContain('### ⮑ End subagent: code-reviewer')

    // The orphan (agent-orphan) should NOT appear in the formatted session
    expect(md).not.toContain('### ⮑ Subagent: helper')

    // Main session content should be present
    expect(md).toContain('Please review my auth changes using a subagent.')
    expect(md).toContain('I\'ll launch a code review subagent for you.')
    expect(md).toContain('The subagent reviewed your auth changes and they look good.')
  })
})

describe('manifest.subagentCount', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('count reflects both matched and orphaned subagents', () => {
    const meta1 = JSON.stringify({
      agentType: 'reviewer',
      description: 'Review code',
      toolUseId: 'matched-id',
    })
    const meta2 = JSON.stringify({
      agentType: 'linter',
      description: 'Lint code',
      toolUseId: 'orphan-id',
    })

    mockExistsSync.mockImplementation((p) => {
      const ps = p as string
      return (
        ps.endsWith('subagents') ||
        ps.endsWith('agent-r.jsonl') ||
        ps.endsWith('agent-l.jsonl')
      )
    })
    mockReaddirSync.mockReturnValue([
      'agent-r.meta.json',
      'agent-l.meta.json',
    ] as unknown as ReturnType<typeof readdirSync>)
    mockReadFileSync.mockImplementation((p) => {
      const ps = p as string
      if (ps.endsWith('agent-r.meta.json')) return meta1
      if (ps.endsWith('agent-l.meta.json')) return meta2
      // Empty transcript
      return JSON.stringify({
        type: 'user',
        uuid: 'u1',
        parentUuid: null,
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'task' },
      })
    })

    const { count } = loadSubagents('/some/hash/session.jsonl', 'session')
    expect(count).toBe(2)
  })
})
