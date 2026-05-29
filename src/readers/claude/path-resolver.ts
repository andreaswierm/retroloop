import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Transforms a filesystem path (CWD) into the format Claude Code uses
 * for its project directories: replace every `/` with `-`.
 *
 * Example: `/Users/andreas/projects/bits` → `-Users-andreas-projects-bits`
 */
export function transformCwdToProjectSlug(cwd: string): string {
  return cwd.replace(/\//g, '-')
}

/**
 * Resolves the absolute path to a Claude Code session transcript.
 *
 * Manual Mode: derives the path from CWD + session ID.
 * If `transcriptPath` is provided, it is used directly (Hook Mode).
 *
 * Throws an error with the attempted path if the file does not exist.
 */
export function resolveTranscriptPath(
  sessionId: string,
  cwd: string,
  transcriptPath?: string,
): string {
  if (transcriptPath !== undefined) {
    if (!existsSync(transcriptPath)) {
      throw new Error(
        `Transcript not found at provided path: ${transcriptPath}`,
      )
    }
    return transcriptPath
  }

  const slug = transformCwdToProjectSlug(cwd)
  const resolved = join(homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`)

  if (!existsSync(resolved)) {
    throw new Error(
      `Transcript not found. Attempted path: ${resolved}`,
    )
  }

  return resolved
}
