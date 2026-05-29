import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface FileOutputOptions {
  pathTemplate: string  // supports {{SESSION_ID}}
  sessionId: string
  content: string
}

/**
 * Resolves {{SESSION_ID}} in a path template and returns the concrete path.
 */
export function resolveOutputPath(pathTemplate: string, sessionId: string): string {
  return pathTemplate.replace(/\{\{SESSION_ID\}\}/g, sessionId)
}

/**
 * Writes runner output verbatim to a file path, creating parent directories
 * if they do not already exist. {{SESSION_ID}} in pathTemplate is substituted
 * before writing.
 */
export function writeFileOutput({ pathTemplate, sessionId, content }: FileOutputOptions): void {
  const resolvedPath = resolve(resolveOutputPath(pathTemplate, sessionId))
  const dir = dirname(resolvedPath)
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolvedPath, content, 'utf8')
}
