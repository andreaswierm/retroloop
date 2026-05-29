import { spawnSync } from 'node:child_process'

/**
 * Parses a GitHub remote URL (HTTPS or SSH) and returns `owner/repo`.
 *
 * Supported formats:
 *   https://github.com/owner/repo.git  →  owner/repo
 *   https://github.com/owner/repo      →  owner/repo
 *   git@github.com:owner/repo.git      →  owner/repo
 *   git@github.com:owner/repo          →  owner/repo
 *
 * Throws a clear error for non-GitHub URLs or URLs that cannot be parsed.
 */
export function parseGithubRepo(remoteUrl: string): string {
  const httpsMatch = remoteUrl.match(
    /^https?:\/\/github\.com\/([A-Za-z0-9_.\-]+\/[A-Za-z0-9_.\-]+?)(?:\.git)?\s*$/
  )
  if (httpsMatch) {
    return httpsMatch[1]
  }

  const sshMatch = remoteUrl.match(
    /^git@github\.com:([A-Za-z0-9_.\-]+\/[A-Za-z0-9_.\-]+?)(?:\.git)?\s*$/
  )
  if (sshMatch) {
    return sshMatch[1]
  }

  // Check if it's a recognisable GitHub URL that just failed to parse
  if (remoteUrl.includes('github.com')) {
    throw new Error(
      `retroloop: could not parse GitHub remote URL: ${remoteUrl.trim()}\n` +
        'Expected format: https://github.com/owner/repo.git or git@github.com:owner/repo.git'
    )
  }

  throw new Error(
    `retroloop: remote origin is not a GitHub URL: ${remoteUrl.trim()}\n` +
      'Use --github-repo owner/repo to specify the repository explicitly.'
  )
}

/**
 * Detects the GitHub repository from the `git remote get-url origin` output
 * in the given working directory.
 *
 * Returns `owner/repo`.
 * Throws a clear error when:
 *   - no `origin` remote exists
 *   - the remote URL is not a GitHub URL
 *   - the URL cannot be parsed
 */
export function detectGithubRepo(cwd: string): string {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd,
    encoding: 'utf8',
  })

  if (result.status !== 0 || result.stdout == null || result.stdout.trim() === '') {
    throw new Error(
      'retroloop: could not detect GitHub repository — no `origin` remote found.\n' +
        'Use --github-repo owner/repo to specify the repository explicitly.'
    )
  }

  return parseGithubRepo(result.stdout.trim())
}

export interface GithubIssueOptions {
  repo: string
  title: string
  labels: string
  body: string
}

/**
 * Creates a GitHub issue via the `gh` CLI.
 * Throws if `gh issue create` exits with a non-zero code.
 */
export function createGithubIssue({ repo, title, labels, body }: GithubIssueOptions): string {
  const result = spawnSync(
    'gh',
    ['issue', 'create', '--repo', repo, '--title', title, '--label', labels, '--body', body],
    { encoding: 'utf8' }
  )

  if (result.status !== 0) {
    const stderr = result.stderr ?? ''
    throw new Error(
      `retroloop: gh issue create failed (exit ${result.status ?? 'unknown'}).\n${stderr.trim()}`
    )
  }

  return (result.stdout ?? '').trim()
}

export interface TitleContext {
  sessionId: string
  date: string
}

/**
 * Substitutes `{{SESSION_ID}}` and `{{DATE}}` in the title template.
 */
export function interpolateTitle(template: string, { sessionId, date }: TitleContext): string {
  return template
    .replace(/\{\{SESSION_ID\}\}/g, sessionId)
    .replace(/\{\{DATE\}\}/g, date)
}
