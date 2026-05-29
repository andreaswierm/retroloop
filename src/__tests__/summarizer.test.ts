import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

// Mock node:child_process before importing the module under test
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}))

import { spawn, spawnSync } from 'node:child_process'
import {
  shouldSummarize,
  summarize,
  DEFAULT_SUMMARIZER_MODEL,
  DEFAULT_SUMMARIZER_THRESHOLD_CHARS,
} from '../summarizer/index.js'

const mockSpawn = spawn as ReturnType<typeof vi.fn>
const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>

beforeEach(() => {
  // By default, claude CLI is available (spawnSync returns status 0)
  mockSpawnSync.mockReturnValue({ status: 0, stdout: 'claude 1.0.0', stderr: '', error: undefined })
})

afterEach(() => {
  vi.clearAllMocks()
})

/**
 * Creates a minimal fake child process that emits data + close events.
 */
function makeFakeChild(options: {
  stdout: string
  exitCode: number
  spawnError?: Error
}) {
  const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter
  const child = new EventEmitter() as ReturnType<typeof spawn>
  ;(child as unknown as { stdout: typeof stdout }).stdout = stdout

  setImmediate(() => {
    if (options.spawnError) {
      child.emit('error', options.spawnError)
    } else {
      stdout.emit('data', Buffer.from(options.stdout))
      child.emit('close', options.exitCode)
    }
  })

  return child
}

// ---------------------------------------------------------------------------
// shouldSummarize() — pure threshold logic
// ---------------------------------------------------------------------------

describe('shouldSummarize()', () => {
  it('returns false when bodyChars equals the threshold', () => {
    expect(shouldSummarize(50000, 50000)).toBe(false)
  })

  it('returns false when bodyChars is below the threshold', () => {
    expect(shouldSummarize(49999, 50000)).toBe(false)
  })

  it('returns true when bodyChars is one above the threshold', () => {
    expect(shouldSummarize(50001, 50000)).toBe(true)
  })

  it('returns true when bodyChars far exceeds the threshold', () => {
    expect(shouldSummarize(200000, 50000)).toBe(true)
  })

  it('returns false for zero chars', () => {
    expect(shouldSummarize(0, 50000)).toBe(false)
  })

  it('respects a custom threshold', () => {
    expect(shouldSummarize(101, 100)).toBe(true)
    expect(shouldSummarize(100, 100)).toBe(false)
    expect(shouldSummarize(99, 100)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// DEFAULT_SUMMARIZER_MODEL / DEFAULT_SUMMARIZER_THRESHOLD_CHARS constants
// ---------------------------------------------------------------------------

describe('exported defaults', () => {
  it('exports the correct default model', () => {
    expect(DEFAULT_SUMMARIZER_MODEL).toBe('claude-haiku-4-5-20251001')
  })

  it('exports the correct default threshold', () => {
    expect(DEFAULT_SUMMARIZER_THRESHOLD_CHARS).toBe(50000)
  })
})

// ---------------------------------------------------------------------------
// summarize() — integration with runClaude
// ---------------------------------------------------------------------------

describe('summarize()', () => {
  it('returns the original body unchanged when below threshold', async () => {
    const smallBody = 'x'.repeat(100)

    const result = await summarize({
      markdown: smallBody,
      cwd: '/project',
      summarizerThresholdChars: 50000,
    })

    expect(result.body).toBe(smallBody)
    expect(result.summarized).toBe(false)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('returns the original body when exactly at threshold (not above)', async () => {
    const bodyAtThreshold = 'x'.repeat(50000)

    const result = await summarize({
      markdown: bodyAtThreshold,
      cwd: '/project',
      summarizerThresholdChars: 50000,
    })

    expect(result.body).toBe(bodyAtThreshold)
    expect(result.summarized).toBe(false)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('calls runClaude when body exceeds threshold', async () => {
    const largeBody = 'x'.repeat(50001)
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: 'condensed summary', exitCode: 0 }))

    await summarize({
      markdown: largeBody,
      cwd: '/project',
      summarizerThresholdChars: 50000,
    })

    expect(mockSpawn).toHaveBeenCalledOnce()
  })

  it('returns the summary from the cheap model as the new body', async () => {
    const largeBody = 'x'.repeat(50001)
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: 'condensed summary', exitCode: 0 }))

    const result = await summarize({
      markdown: largeBody,
      cwd: '/project',
      summarizerThresholdChars: 50000,
    })

    expect(result.body).toBe('condensed summary')
    expect(result.summarized).toBe(true)
  })

  it('uses the default model when summarizerModel is not specified', async () => {
    const largeBody = 'x'.repeat(50001)
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: 'summary', exitCode: 0 }))

    await summarize({
      markdown: largeBody,
      cwd: '/project',
    })

    const args: string[] = mockSpawn.mock.calls[0][1]
    expect(args).toContain('--model')
    expect(args).toContain(DEFAULT_SUMMARIZER_MODEL)
  })

  it('uses a custom summarizerModel when provided', async () => {
    const largeBody = 'x'.repeat(50001)
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: 'summary', exitCode: 0 }))

    await summarize({
      markdown: largeBody,
      cwd: '/project',
      summarizerModel: 'claude-custom-model',
    })

    const args: string[] = mockSpawn.mock.calls[0][1]
    expect(args).toContain('--model')
    expect(args).toContain('claude-custom-model')
  })

  it('uses the default threshold when summarizerThresholdChars is not specified', async () => {
    // Just below default threshold — should NOT summarize
    const bodyJustBelow = 'x'.repeat(DEFAULT_SUMMARIZER_THRESHOLD_CHARS)

    const result = await summarize({
      markdown: bodyJustBelow,
      cwd: '/project',
    })

    expect(result.summarized).toBe(false)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('uses a custom threshold when summarizerThresholdChars is provided', async () => {
    // 200 chars — above custom threshold of 100
    const body = 'x'.repeat(200)
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: 'small summary', exitCode: 0 }))

    const result = await summarize({
      markdown: body,
      cwd: '/project',
      summarizerThresholdChars: 100,
    })

    expect(result.summarized).toBe(true)
    expect(result.body).toBe('small summary')
  })

  it('passes the summarizer prompt prepended to the body', async () => {
    const largeBody = 'SESSION CONTENT HERE'.repeat(3000)
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: 'summary', exitCode: 0 }))

    await summarize({
      markdown: largeBody,
      cwd: '/project',
      summarizerThresholdChars: 1000,
    })

    const args: string[] = mockSpawn.mock.calls[0][1]
    // The prompt arg ('-p') should be followed by a string containing the session body
    const pIndex = args.indexOf('-p')
    expect(pIndex).toBeGreaterThanOrEqual(0)
    const promptArg = args[pIndex + 1]
    expect(promptArg).toContain('SESSION CONTENT HERE')
  })

  it('spawns claude from the provided CWD', async () => {
    const largeBody = 'x'.repeat(50001)
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: 'summary', exitCode: 0 }))

    await summarize({
      markdown: largeBody,
      cwd: '/my/project',
    })

    const spawnOptions = mockSpawn.mock.calls[0][2]
    expect(spawnOptions.cwd).toBe('/my/project')
  })

  it('throws when the summarizer process exits non-zero', async () => {
    const largeBody = 'x'.repeat(50001)
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: '', exitCode: 2 }))

    await expect(
      summarize({ markdown: largeBody, cwd: '/project' })
    ).rejects.toThrow('Summarizer exited with code 2')
  })
})
