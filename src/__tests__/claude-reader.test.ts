import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES = join(__dirname, 'fixtures')

// Mock node:fs existsSync so the reader can locate fixtures
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: vi.fn() }
})

import { existsSync } from 'node:fs'
import { claudeSessionReader } from '../readers/claude/index.js'

const mockExistsSync = vi.mocked(existsSync)

describe('claudeSessionReader', () => {
  beforeEach(() => {
    mockExistsSync.mockReset()
  })

  it('has the correct provider and flag', () => {
    expect(claudeSessionReader.provider).toBe('claude-code')
    expect(claudeSessionReader.flag).toBe('--claude-session-id')
  })

  it('reads a simple fixture and returns manifest + markdown', async () => {
    const fixturePath = join(FIXTURES, 'simple-session.jsonl')
    mockExistsSync.mockReturnValue(true)

    const { manifest, markdown } = await claudeSessionReader.read({
      sessionId: 'test-session-id',
      cwd: '/Users/test/project',
      transcriptPath: fixturePath,
    })

    expect(manifest.provider).toBe('claude-code')
    expect(manifest.sessionId).toBe('test-session-id')
    expect(manifest.projectName).toBe('project')
    expect(manifest.cliVersion).toBe('1.2.3')
    expect(manifest.model).toBe('claude-opus-4-5')
    expect(manifest.turnCount).toBe(4) // 2 user + 2 assistant
    expect(manifest.subagentCount).toBe(0)
    expect(manifest.summarized).toBe(false)
    expect(typeof manifest.date).toBe('string')
    expect(manifest.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    expect(markdown).toContain('## Turn 1 — User')
    expect(markdown).toContain('## Turn 2 — Assistant')
  })

  it('returns markdown body with session content from the fixture', async () => {
    const fixturePath = join(FIXTURES, 'simple-session.jsonl')
    mockExistsSync.mockReturnValue(true)

    const { markdown } = await claudeSessionReader.read({
      sessionId: 'test-session-id',
      cwd: '/some/project',
      transcriptPath: fixturePath,
    })

    expect(markdown).toContain('Hello, can you help me write a function?')
    expect(markdown).toContain('Sure!')
  })

  it('throws when transcript path does not exist', async () => {
    mockExistsSync.mockReturnValue(false)
    await expect(
      claudeSessionReader.read({
        sessionId: 'bad-session',
        cwd: '/some/project',
        transcriptPath: '/does/not/exist.jsonl',
      }),
    ).rejects.toThrow('Transcript not found')
  })

  it('derives projectName from the basename of cwd', async () => {
    const fixturePath = join(FIXTURES, 'simple-session.jsonl')
    mockExistsSync.mockReturnValue(true)

    const { manifest } = await claudeSessionReader.read({
      sessionId: 'x',
      cwd: '/Users/someone/repos/my-awesome-app',
      transcriptPath: fixturePath,
    })

    expect(manifest.projectName).toBe('my-awesome-app')
  })
})
