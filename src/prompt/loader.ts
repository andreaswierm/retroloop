import { readFile } from 'node:fs/promises'
import { DEFAULT_PROMPT } from './default-prompt.js'

/**
 * Loads the prompt template.
 *
 * If `promptFile` is provided, reads and returns its contents.
 * Otherwise returns the bundled default retrospective prompt.
 *
 * Throws if `promptFile` is provided but cannot be read.
 */
export async function loadPrompt(promptFile?: string): Promise<string> {
  if (promptFile !== undefined) {
    return readFile(promptFile, 'utf8')
  }
  return DEFAULT_PROMPT
}
