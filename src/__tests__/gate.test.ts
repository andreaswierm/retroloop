import { describe, it, expect } from 'vitest'
import { checkSignificance } from '../gate/index.js'

describe('checkSignificance()', () => {
  describe('threshold boundary', () => {
    it('passes when bodyChars equals minSessionChars exactly', () => {
      const result = checkSignificance({ bodyChars: 1000, minSessionChars: 1000, force: false })
      expect(result.pass).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('passes when bodyChars exceeds minSessionChars', () => {
      const result = checkSignificance({ bodyChars: 1001, minSessionChars: 1000, force: false })
      expect(result.pass).toBe(true)
    })

    it('fails when bodyChars is one below minSessionChars', () => {
      const result = checkSignificance({ bodyChars: 999, minSessionChars: 1000, force: false })
      expect(result.pass).toBe(false)
    })

    it('fails when bodyChars is well below minSessionChars', () => {
      const result = checkSignificance({ bodyChars: 42, minSessionChars: 1000, force: false })
      expect(result.pass).toBe(false)
    })

    it('includes the actual char count and threshold in the reason', () => {
      const result = checkSignificance({ bodyChars: 42, minSessionChars: 500, force: false })
      expect(result.pass).toBe(false)
      expect(result.reason).toContain('42')
      expect(result.reason).toContain('500')
    })

    it('fails for a zero-length session', () => {
      const result = checkSignificance({ bodyChars: 0, minSessionChars: 1000, force: false })
      expect(result.pass).toBe(false)
    })

    it('uses the provided minSessionChars, not a hardcoded default', () => {
      // Below default 1000 but above custom 10
      const result = checkSignificance({ bodyChars: 50, minSessionChars: 10, force: false })
      expect(result.pass).toBe(true)
    })
  })

  describe('--force bypass', () => {
    it('passes even when bodyChars is zero and force is true', () => {
      const result = checkSignificance({ bodyChars: 0, minSessionChars: 1000, force: true })
      expect(result.pass).toBe(true)
    })

    it('passes even when bodyChars is well below threshold and force is true', () => {
      const result = checkSignificance({ bodyChars: 1, minSessionChars: 99999, force: true })
      expect(result.pass).toBe(true)
    })

    it('returns no reason when force bypasses the gate', () => {
      const result = checkSignificance({ bodyChars: 0, minSessionChars: 1000, force: true })
      expect(result.reason).toBeUndefined()
    })

    it('force=false still respects the threshold', () => {
      const result = checkSignificance({ bodyChars: 500, minSessionChars: 1000, force: false })
      expect(result.pass).toBe(false)
    })
  })
})
