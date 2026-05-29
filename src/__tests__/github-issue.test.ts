import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock node:child_process before importing the module under test
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

import { spawnSync } from 'node:child_process'
import {
  parseGithubRepo,
  detectGithubRepo,
  createGithubIssue,
  interpolateTitle,
  assertGhCli,
} from '../output/github-issue.js'

const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>

/** Convenience: a spawnSync result that means "CLI found and returned exit 0" */
const ghAvailable = { status: 0, stdout: 'gh version 2.0.0', stderr: '', error: undefined }

beforeEach(() => {
  // By default gh CLI is available (first call in assertGhCli)
  mockSpawnSync.mockReturnValue(ghAvailable)
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// parseGithubRepo
// ---------------------------------------------------------------------------

describe('parseGithubRepo()', () => {
  it('parses HTTPS URL with .git suffix', () => {
    expect(parseGithubRepo('https://github.com/owner/repo.git')).toBe('owner/repo')
  })

  it('parses HTTPS URL without .git suffix', () => {
    expect(parseGithubRepo('https://github.com/owner/repo')).toBe('owner/repo')
  })

  it('parses SSH URL with .git suffix', () => {
    expect(parseGithubRepo('git@github.com:owner/repo.git')).toBe('owner/repo')
  })

  it('parses SSH URL without .git suffix', () => {
    expect(parseGithubRepo('git@github.com:owner/repo')).toBe('owner/repo')
  })

  it('handles trailing newline (as returned by git)', () => {
    expect(parseGithubRepo('https://github.com/owner/repo.git\n')).toBe('owner/repo')
  })

  it('handles owner/repo with hyphens and dots', () => {
    expect(parseGithubRepo('https://github.com/my-org/my.repo.git')).toBe('my-org/my.repo')
  })

  it('throws a clear error for a non-GitHub HTTPS URL', () => {
    expect(() => parseGithubRepo('https://gitlab.com/owner/repo.git')).toThrow(
      'not a GitHub URL'
    )
  })

  it('throws a clear error for a non-GitHub SSH URL', () => {
    expect(() => parseGithubRepo('git@bitbucket.org:owner/repo.git')).toThrow(
      'not a GitHub URL'
    )
  })

  it('throws a clear error for an unparseable GitHub URL', () => {
    expect(() => parseGithubRepo('https://github.com/')).toThrow(
      'could not parse GitHub remote URL'
    )
  })

  it('throws a clear error for an empty string', () => {
    expect(() => parseGithubRepo('')).toThrow('not a GitHub URL')
  })
})

// ---------------------------------------------------------------------------
// detectGithubRepo
// ---------------------------------------------------------------------------

describe('detectGithubRepo()', () => {
  it('returns owner/repo when git remote get-url origin succeeds', () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: 'https://github.com/owner/repo.git\n',
      stderr: '',
    })

    expect(detectGithubRepo('/some/cwd')).toBe('owner/repo')
    expect(mockSpawnSync).toHaveBeenCalledWith('git', ['remote', 'get-url', 'origin'], {
      cwd: '/some/cwd',
      encoding: 'utf8',
    })
  })

  it('throws a clear error when git exits non-zero (no origin)', () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 128,
      stdout: '',
      stderr: "fatal: No such remote 'origin'\n",
    })

    expect(() => detectGithubRepo('/some/cwd')).toThrow('no `origin` remote found')
  })

  it('throws a clear error when stdout is empty', () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: '',
      stderr: '',
    })

    expect(() => detectGithubRepo('/some/cwd')).toThrow('no `origin` remote found')
  })

  it('propagates parse errors from parseGithubRepo', () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: 'https://gitlab.com/owner/repo.git\n',
      stderr: '',
    })

    expect(() => detectGithubRepo('/some/cwd')).toThrow('not a GitHub URL')
  })
})

// ---------------------------------------------------------------------------
// createGithubIssue
// ---------------------------------------------------------------------------

describe('createGithubIssue()', () => {
  it('calls gh issue create with the correct arguments', () => {
    // First call: assertGhCli check; second call: gh issue create
    mockSpawnSync
      .mockReturnValueOnce(ghAvailable)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'https://github.com/owner/repo/issues/42\n',
        stderr: '',
      })

    createGithubIssue({
      repo: 'owner/repo',
      title: 'My retro',
      labels: 'retroloop',
      body: 'Some body text',
    })

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'gh',
      [
        'issue', 'create',
        '--repo', 'owner/repo',
        '--title', 'My retro',
        '--label', 'retroloop',
        '--body', 'Some body text',
      ],
      { encoding: 'utf8' }
    )
  })

  it('returns the trimmed stdout (issue URL)', () => {
    mockSpawnSync
      .mockReturnValueOnce(ghAvailable)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'https://github.com/owner/repo/issues/42\n',
        stderr: '',
      })

    const url = createGithubIssue({
      repo: 'owner/repo',
      title: 'My retro',
      labels: 'retroloop',
      body: 'body',
    })

    expect(url).toBe('https://github.com/owner/repo/issues/42')
  })

  it('throws a clear error when gh exits non-zero', () => {
    mockSpawnSync
      .mockReturnValueOnce(ghAvailable)
      .mockReturnValueOnce({
        status: 1,
        stdout: '',
        stderr: 'gh: authentication required\n',
      })

    expect(() =>
      createGithubIssue({ repo: 'owner/repo', title: 't', labels: 'l', body: 'b' })
    ).toThrow('gh issue create failed')
  })

  it('handles null stderr and null status gracefully in error message', () => {
    mockSpawnSync
      .mockReturnValueOnce(ghAvailable)
      .mockReturnValueOnce({
        status: null,
        stdout: null,
        stderr: null,
      })

    expect(() =>
      createGithubIssue({ repo: 'owner/repo', title: 't', labels: 'l', body: 'b' })
    ).toThrow('exit unknown')
  })

  it('handles null stdout gracefully on success', () => {
    mockSpawnSync
      .mockReturnValueOnce(ghAvailable)
      .mockReturnValueOnce({
        status: 0,
        stdout: null,
        stderr: '',
      })

    const url = createGithubIssue({ repo: 'owner/repo', title: 't', labels: 'l', body: 'b' })
    expect(url).toBe('')
  })

  it('throws a clear error when gh CLI is not found (ENOENT)', () => {
    mockSpawnSync.mockReturnValueOnce({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('spawn ENOENT'),
    })

    expect(() =>
      createGithubIssue({ repo: 'owner/repo', title: 't', labels: 'l', body: 'b' })
    ).toThrow('gh CLI not found. Install it from https://cli.github.com')
  })

  it('throws a clear error when gh CLI is not found (null status, no error)', () => {
    mockSpawnSync.mockReturnValueOnce({
      status: null,
      stdout: '',
      stderr: '',
      error: undefined,
    })

    expect(() =>
      createGithubIssue({ repo: 'owner/repo', title: 't', labels: 'l', body: 'b' })
    ).toThrow('gh CLI not found. Install it from https://cli.github.com')
  })
})

// ---------------------------------------------------------------------------
// assertGhCli
// ---------------------------------------------------------------------------

describe('assertGhCli()', () => {
  it('does not throw when gh CLI is available', () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: 'gh version 2.0.0', stderr: '', error: undefined })
    expect(() => assertGhCli()).not.toThrow()
  })

  it('throws a clear error when spawnSync returns an error (ENOENT)', () => {
    mockSpawnSync.mockReturnValueOnce({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('spawn ENOENT'),
    })
    expect(() => assertGhCli()).toThrow(
      'gh CLI not found. Install it from https://cli.github.com'
    )
  })

  it('throws a clear error when spawnSync returns null status (not on PATH)', () => {
    mockSpawnSync.mockReturnValueOnce({
      status: null,
      stdout: '',
      stderr: '',
      error: undefined,
    })
    expect(() => assertGhCli()).toThrow(
      'gh CLI not found. Install it from https://cli.github.com'
    )
  })

  it('does not throw for non-zero exit status (CLI found but errored)', () => {
    mockSpawnSync.mockReturnValueOnce({ status: 1, stdout: '', stderr: 'error', error: undefined })
    expect(() => assertGhCli()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// interpolateTitle
// ---------------------------------------------------------------------------

describe('interpolateTitle()', () => {
  it('substitutes {{SESSION_ID}} and {{DATE}}', () => {
    expect(
      interpolateTitle('Retro: {{SESSION_ID}} — {{DATE}}', {
        sessionId: 'abc-123',
        date: '2026-05-29',
      })
    ).toBe('Retro: abc-123 — 2026-05-29')
  })

  it('substitutes multiple occurrences of each token', () => {
    expect(
      interpolateTitle('{{SESSION_ID}} / {{DATE}} / {{SESSION_ID}}', {
        sessionId: 'x',
        date: '2026-01-01',
      })
    ).toBe('x / 2026-01-01 / x')
  })

  it('leaves the template unchanged when no tokens are present', () => {
    expect(
      interpolateTitle('Static title', { sessionId: 'abc', date: '2026-05-29' })
    ).toBe('Static title')
  })

  it('handles an empty template', () => {
    expect(interpolateTitle('', { sessionId: 'abc', date: '2026-05-29' })).toBe('')
  })

  it('substitutes only {{SESSION_ID}} when {{DATE}} is absent', () => {
    expect(
      interpolateTitle('Session: {{SESSION_ID}}', { sessionId: 'sess-7', date: '2026-05-29' })
    ).toBe('Session: sess-7')
  })
})
