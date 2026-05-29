import { describe, it, expect } from 'vitest'
import { interpolate, injectSessionContent, type PromptContext } from '../prompt/interpolator.js'

const baseContext: PromptContext = {
  SESSION_ID: 'abc-123',
  DATE: '2026-05-29',
  PROJECT_NAME: 'my-project',
  PROVIDER: 'claude-code',
}

describe('interpolate()', () => {
  it('substitutes {{SESSION_ID}}', () => {
    const result = interpolate('Session: {{SESSION_ID}}', baseContext)
    expect(result).toBe('Session: abc-123')
  })

  it('substitutes {{DATE}}', () => {
    const result = interpolate('Date: {{DATE}}', baseContext)
    expect(result).toBe('Date: 2026-05-29')
  })

  it('substitutes {{PROJECT_NAME}}', () => {
    const result = interpolate('Project: {{PROJECT_NAME}}', baseContext)
    expect(result).toBe('Project: my-project')
  })

  it('substitutes {{PROVIDER}}', () => {
    const result = interpolate('Provider: {{PROVIDER}}', baseContext)
    expect(result).toBe('Provider: claude-code')
  })

  it('substitutes all tokens in a single template', () => {
    const template = '{{SESSION_ID}} | {{DATE}} | {{PROJECT_NAME}} | {{PROVIDER}}'
    const result = interpolate(template, baseContext)
    expect(result).toBe('abc-123 | 2026-05-29 | my-project | claude-code')
  })

  it('replaces multiple occurrences of the same token', () => {
    const template = '{{SESSION_ID}} and again {{SESSION_ID}}'
    const result = interpolate(template, baseContext)
    expect(result).toBe('abc-123 and again abc-123')
  })

  it('leaves unknown tokens as-is', () => {
    const template = 'Hello {{UNKNOWN_TOKEN}} world'
    const result = interpolate(template, baseContext)
    expect(result).toBe('Hello {{UNKNOWN_TOKEN}} world')
  })

  it('leaves {{SESSION_CONTENT}} untouched (internal token, not for user templates)', () => {
    const template = 'content: {{SESSION_CONTENT}}'
    const result = interpolate(template, baseContext)
    // interpolate() must not substitute {{SESSION_CONTENT}}
    expect(result).toBe('content: {{SESSION_CONTENT}}')
  })

  it('handles an empty template', () => {
    const result = interpolate('', baseContext)
    expect(result).toBe('')
  })

  it('handles a template with no tokens', () => {
    const result = interpolate('no tokens here', baseContext)
    expect(result).toBe('no tokens here')
  })

  it('handles context values that are empty strings', () => {
    const ctx: PromptContext = { ...baseContext, SESSION_ID: '' }
    const result = interpolate('id=|{{SESSION_ID}}|', ctx)
    expect(result).toBe('id=||')
  })

  it('handles context values containing special regex characters', () => {
    const ctx: PromptContext = { ...baseContext, PROJECT_NAME: 'foo/bar (baz)' }
    const result = interpolate('{{PROJECT_NAME}}', ctx)
    expect(result).toBe('foo/bar (baz)')
  })
})

describe('injectSessionContent()', () => {
  it('substitutes {{SESSION_CONTENT}} with the session markdown', () => {
    const prompt = 'Review this:\n{{SESSION_CONTENT}}\nEnd'
    const result = injectSessionContent(prompt, '## Turn 1\nHello')
    expect(result).toBe('Review this:\n## Turn 1\nHello\nEnd')
  })

  it('replaces multiple occurrences of {{SESSION_CONTENT}}', () => {
    const prompt = '{{SESSION_CONTENT}} ... {{SESSION_CONTENT}}'
    const result = injectSessionContent(prompt, 'CONTENT')
    expect(result).toBe('CONTENT ... CONTENT')
  })

  it('leaves other tokens untouched', () => {
    const prompt = '{{SESSION_ID}}\n{{SESSION_CONTENT}}'
    const result = injectSessionContent(prompt, 'body')
    expect(result).toBe('{{SESSION_ID}}\nbody')
  })

  it('handles empty session content', () => {
    const result = injectSessionContent('{{SESSION_CONTENT}}', '')
    expect(result).toBe('')
  })

  it('returns the prompt unchanged if {{SESSION_CONTENT}} is absent', () => {
    const prompt = 'No session token here'
    const result = injectSessionContent(prompt, 'body')
    expect(result).toBe('No session token here')
  })
})
