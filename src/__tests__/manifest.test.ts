import { describe, it, expect } from 'vitest'
import { renderManifest } from '../readers/manifest.js'
import type { SessionManifest } from '../readers/types.js'

const baseManifest: SessionManifest = {
  provider: 'claude-code',
  sessionId: 'abc-123',
  projectName: 'my-project',
  date: '2024-01-15',
  turnCount: 4,
  subagentCount: 0,
  summarized: false,
}

describe('renderManifest', () => {
  it('renders all required fields', () => {
    const output = renderManifest(baseManifest)
    expect(output).toContain('provider: claude-code')
    expect(output).toContain('session-id: abc-123')
    expect(output).toContain('project: my-project')
    expect(output).toContain('date: 2024-01-15')
    expect(output).toContain('turns: 4')
    expect(output).toContain('subagents: 0')
    expect(output).toContain('summarized: false')
  })

  it('wraps the header in --- delimiters', () => {
    const output = renderManifest(baseManifest)
    const lines = output.split('\n')
    expect(lines[0]).toBe('---')
    // find the closing ---
    const closingIdx = lines.indexOf('---', 1)
    expect(closingIdx).toBeGreaterThan(0)
  })

  it('omits cliVersion when not provided', () => {
    const output = renderManifest(baseManifest)
    expect(output).not.toContain('cli-version')
  })

  it('includes cliVersion when provided', () => {
    const manifest = { ...baseManifest, cliVersion: '1.2.3' }
    const output = renderManifest(manifest)
    expect(output).toContain('cli-version: 1.2.3')
  })

  it('omits model when not provided', () => {
    const output = renderManifest(baseManifest)
    expect(output).not.toContain('model:')
  })

  it('includes model when provided', () => {
    const manifest = { ...baseManifest, model: 'claude-opus-4-5' }
    const output = renderManifest(manifest)
    expect(output).toContain('model: claude-opus-4-5')
  })

  it('shows summarized: true when session is summarized', () => {
    const manifest = { ...baseManifest, summarized: true }
    const output = renderManifest(manifest)
    expect(output).toContain('summarized: true')
  })

  it('ends with a blank line after the closing ---', () => {
    const output = renderManifest(baseManifest)
    expect(output.endsWith('\n')).toBe(true)
    const lines = output.split('\n')
    // Last element after split on trailing \n is ''
    expect(lines[lines.length - 1]).toBe('')
  })

  it('renders subagent count correctly when non-zero', () => {
    const manifest = { ...baseManifest, subagentCount: 3 }
    const output = renderManifest(manifest)
    expect(output).toContain('subagents: 3')
  })
})
