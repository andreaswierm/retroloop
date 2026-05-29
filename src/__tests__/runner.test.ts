import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

// Mock node:child_process before importing the module under test
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'node:child_process'
import { runClaude } from '../runner/index.js'

const mockSpawn = spawn as ReturnType<typeof vi.fn>

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

  // Trigger events asynchronously so handlers can be registered first
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

describe('runClaude()', () => {
  it('spawns claude with -p and the prompt', async () => {
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: 'result', exitCode: 0 }))

    await runClaude({ prompt: 'hello', cwd: '/project' })

    expect(mockSpawn).toHaveBeenCalledOnce()
    const [cmd, args] = mockSpawn.mock.calls[0]
    expect(cmd).toBe('claude')
    expect(args).toContain('-p')
    expect(args).toContain('hello')
  })

  it('spawns from the provided CWD', async () => {
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: '', exitCode: 0 }))

    await runClaude({ prompt: 'p', cwd: '/my/project' })

    const spawnOptions = mockSpawn.mock.calls[0][2]
    expect(spawnOptions.cwd).toBe('/my/project')
  })

  it('does NOT pass --allowedTools (ADR 0001)', async () => {
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: '', exitCode: 0 }))

    await runClaude({ prompt: 'p', cwd: '/project' })

    const args: string[] = mockSpawn.mock.calls[0][1]
    expect(args).not.toContain('--allowedTools')
  })

  it('passes --model when model option is set', async () => {
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: '', exitCode: 0 }))

    await runClaude({ prompt: 'p', cwd: '/project', model: 'claude-opus-4-5' })

    const args: string[] = mockSpawn.mock.calls[0][1]
    expect(args).toContain('--model')
    expect(args).toContain('claude-opus-4-5')
  })

  it('omits --model when model option is not set', async () => {
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: '', exitCode: 0 }))

    await runClaude({ prompt: 'p', cwd: '/project' })

    const args: string[] = mockSpawn.mock.calls[0][1]
    expect(args).not.toContain('--model')
  })

  it('returns stdout verbatim', async () => {
    const expected = '# Retro\n\nSome content here.\n'
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: expected, exitCode: 0 }))

    const result = await runClaude({ prompt: 'p', cwd: '/project' })

    expect(result.stdout).toBe(expected)
  })

  it('returns the exit code from the child process', async () => {
    mockSpawn.mockReturnValueOnce(makeFakeChild({ stdout: '', exitCode: 42 }))

    const result = await runClaude({ prompt: 'p', cwd: '/project' })

    expect(result.exitCode).toBe(42)
  })

  it('rejects with an error message when spawn emits an error', async () => {
    mockSpawn.mockReturnValueOnce(
      makeFakeChild({ stdout: '', exitCode: 1, spawnError: new Error('spawn ENOENT') })
    )

    await expect(runClaude({ prompt: 'p', cwd: '/project' })).rejects.toThrow(
      'Failed to spawn claude CLI: spawn ENOENT'
    )
  })

  it('defaults exitCode to 1 when close fires with null (signal kill)', async () => {
    // Simulate a process killed by signal — close fires with null exit code
    const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter
    const child = new EventEmitter() as ReturnType<typeof spawn>
    ;(child as unknown as { stdout: typeof stdout }).stdout = stdout

    setImmediate(() => {
      stdout.emit('data', Buffer.from(''))
      child.emit('close', null) // null means killed by signal
    })

    mockSpawn.mockReturnValueOnce(child)

    const result = await runClaude({ prompt: 'p', cwd: '/project' })
    expect(result.exitCode).toBe(1)
  })
})
