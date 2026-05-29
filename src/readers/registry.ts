import type { SessionReader } from './types.js'

/**
 * Registry of all available Session Readers.
 * Readers register themselves here; the CLI uses `selectReader()` to
 * pick the right one based on which provider flag the user passed.
 */
const readers: SessionReader[] = []

/**
 * Register a Session Reader into the global registry.
 */
export function registerReader(reader: SessionReader): void {
  readers.push(reader)
}

/**
 * Select a Session Reader from the registry by matching its flag against
 * the flags the user provided.
 *
 * @param presentFlags - Set of flag names that are present in the CLI invocation
 * @returns The matching SessionReader, or null if no reader matches
 */
export function selectReader(presentFlags: Set<string>): SessionReader | null {
  for (const reader of readers) {
    if (presentFlags.has(reader.flag)) {
      return reader
    }
  }
  return null
}

/**
 * Returns a copy of the currently registered readers (for inspection/testing).
 */
export function getRegisteredReaders(): SessionReader[] {
  return [...readers]
}

/**
 * Clears all registered readers. Intended for use in tests only.
 */
export function clearReaders(): void {
  readers.length = 0
}
