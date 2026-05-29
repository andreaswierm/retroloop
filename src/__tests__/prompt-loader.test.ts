import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadPrompt } from '../prompt/loader.js'
import { DEFAULT_PROMPT } from '../prompt/default-prompt.js'

// We mock fs/promises so we don't touch the real filesystem in unit tests
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

import { readFile } from 'node:fs/promises'

const mockReadFile = readFile as ReturnType<typeof vi.fn>

afterEach(() => {
  vi.clearAllMocks()
})

describe('loadPrompt()', () => {
  it('returns the bundled default prompt when no promptFile is provided', async () => {
    const result = await loadPrompt()
    expect(result).toBe(DEFAULT_PROMPT)
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('reads and returns the file contents when promptFile is provided', async () => {
    const customPrompt = 'My custom prompt {{SESSION_ID}}'
    mockReadFile.mockResolvedValueOnce(customPrompt)

    const result = await loadPrompt('/path/to/my-prompt.md')

    expect(result).toBe(customPrompt)
    expect(mockReadFile).toHaveBeenCalledWith('/path/to/my-prompt.md', 'utf8')
  })

  it('propagates errors from readFile when the file cannot be read', async () => {
    const fsError = new Error('ENOENT: no such file or directory')
    mockReadFile.mockRejectedValueOnce(fsError)

    await expect(loadPrompt('/nonexistent/path.md')).rejects.toThrow('ENOENT')
  })

  it('bundled default prompt contains all required user-facing tokens', () => {
    expect(DEFAULT_PROMPT).toContain('{{SESSION_ID}}')
    expect(DEFAULT_PROMPT).toContain('{{DATE}}')
    expect(DEFAULT_PROMPT).toContain('{{PROJECT_NAME}}')
    expect(DEFAULT_PROMPT).toContain('{{PROVIDER}}')
  })

  it('bundled default prompt contains internal {{SESSION_CONTENT}} token', () => {
    expect(DEFAULT_PROMPT).toContain('{{SESSION_CONTENT}}')
  })
})
