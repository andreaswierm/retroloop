import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock node:fs so we can control what readFileSync returns
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: vi.fn(),
  }
})

import { readFileSync } from 'node:fs'
import { readHookPayload } from '../hook/index.js'

const mockReadFileSync = vi.mocked(readFileSync)

const VALID_PAYLOAD = {
  session_id: 'abc-123',
  transcript_path: '/home/user/.claude/projects/foo/abc-123.jsonl',
  cwd: '/home/user/projects/foo',
  hook_event_name: 'SessionEnd',
  reason: 'exit',
}

describe('readHookPayload', () => {
  const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')

  beforeEach(() => {
    mockReadFileSync.mockReset()
  })

  afterEach(() => {
    // Restore original isTTY descriptor
    if (originalIsTTY !== undefined) {
      Object.defineProperty(process.stdin, 'isTTY', originalIsTTY)
    } else {
      // In test environments isTTY might not exist; delete the override
        delete (process.stdin as Record<string, unknown>)['isTTY']
    }
  })

  function setIsTTY(value: boolean | undefined) {
    Object.defineProperty(process.stdin, 'isTTY', {
      value,
      writable: true,
      configurable: true,
    })
  }

  it('returns null when stdin is a TTY', () => {
    setIsTTY(true)
    expect(readHookPayload()).toBeNull()
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })

  it('returns a valid HookPayload when stdin is not a TTY and JSON is valid', () => {
    setIsTTY(false)
    mockReadFileSync.mockReturnValue(JSON.stringify(VALID_PAYLOAD))

    const result = readHookPayload()

    expect(result).toEqual(VALID_PAYLOAD)
  })

  it('returns null when stdin contains invalid JSON', () => {
    setIsTTY(false)
    mockReadFileSync.mockReturnValue('not-json')

    expect(readHookPayload()).toBeNull()
  })

  it('returns null when stdin is empty', () => {
    setIsTTY(false)
    mockReadFileSync.mockReturnValue('   ')

    expect(readHookPayload()).toBeNull()
  })

  it('returns null when a required field is missing', () => {
    setIsTTY(false)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { reason: _reason, ...incomplete } = VALID_PAYLOAD
    mockReadFileSync.mockReturnValue(JSON.stringify(incomplete))

    expect(readHookPayload()).toBeNull()
  })

  it('returns null when a required field has the wrong type', () => {
    setIsTTY(false)
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ ...VALID_PAYLOAD, session_id: 42 }),
    )

    expect(readHookPayload()).toBeNull()
  })

  it('returns null when the JSON is an array, not an object', () => {
    setIsTTY(false)
    mockReadFileSync.mockReturnValue(JSON.stringify([VALID_PAYLOAD]))

    expect(readHookPayload()).toBeNull()
  })

  it('returns null when the JSON is null', () => {
    setIsTTY(false)
    mockReadFileSync.mockReturnValue('null')

    expect(readHookPayload()).toBeNull()
  })

  it('returns null when readFileSync throws', () => {
    setIsTTY(false)
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    expect(readHookPayload()).toBeNull()
  })

  it('reads from /dev/stdin', () => {
    setIsTTY(false)
    mockReadFileSync.mockReturnValue(JSON.stringify(VALID_PAYLOAD))

    readHookPayload()

    expect(mockReadFileSync).toHaveBeenCalledWith('/dev/stdin', 'utf-8')
  })

  it('all five required fields are present on the returned payload', () => {
    setIsTTY(false)
    mockReadFileSync.mockReturnValue(JSON.stringify(VALID_PAYLOAD))

    const result = readHookPayload()!

    expect(result.session_id).toBe('abc-123')
    expect(result.transcript_path).toBe('/home/user/.claude/projects/foo/abc-123.jsonl')
    expect(result.cwd).toBe('/home/user/projects/foo')
    expect(result.hook_event_name).toBe('SessionEnd')
    expect(result.reason).toBe('exit')
  })
})
