import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerReader,
  selectReader,
  clearReaders,
  getRegisteredReaders,
} from '../readers/registry.js'
import type { SessionReader } from '../readers/types.js'

const mockReaderA: SessionReader = {
  provider: 'provider-a',
  flag: '--provider-a-session-id',
  read: async () => ({
    manifest: {
      provider: 'provider-a',
      sessionId: 'x',
      projectName: 'test',
      date: '2024-01-01',
      turnCount: 0,
      subagentCount: 0,
      summarized: false,
    },
    markdown: '',
  }),
}

const mockReaderB: SessionReader = {
  provider: 'provider-b',
  flag: '--provider-b-session-id',
  read: async () => ({
    manifest: {
      provider: 'provider-b',
      sessionId: 'y',
      projectName: 'test',
      date: '2024-01-01',
      turnCount: 0,
      subagentCount: 0,
      summarized: false,
    },
    markdown: '',
  }),
}

describe('SessionReader registry', () => {
  beforeEach(() => {
    clearReaders()
  })

  it('starts empty after clearReaders()', () => {
    expect(getRegisteredReaders()).toHaveLength(0)
  })

  it('registers a reader', () => {
    registerReader(mockReaderA)
    expect(getRegisteredReaders()).toHaveLength(1)
  })

  it('selectReader returns the correct reader when its flag is present', () => {
    registerReader(mockReaderA)
    registerReader(mockReaderB)
    const result = selectReader(new Set(['--provider-a-session-id']))
    expect(result).toBe(mockReaderA)
  })

  it('selectReader returns the second reader when the second flag is present', () => {
    registerReader(mockReaderA)
    registerReader(mockReaderB)
    const result = selectReader(new Set(['--provider-b-session-id']))
    expect(result).toBe(mockReaderB)
  })

  it('selectReader returns null when no matching flag is present', () => {
    registerReader(mockReaderA)
    const result = selectReader(new Set(['--unrelated-flag']))
    expect(result).toBeNull()
  })

  it('selectReader returns null for empty flag set', () => {
    registerReader(mockReaderA)
    const result = selectReader(new Set())
    expect(result).toBeNull()
  })

  it('getRegisteredReaders returns a copy (not the internal array)', () => {
    registerReader(mockReaderA)
    const readers = getRegisteredReaders()
    readers.push(mockReaderB)
    expect(getRegisteredReaders()).toHaveLength(1)
  })
})
