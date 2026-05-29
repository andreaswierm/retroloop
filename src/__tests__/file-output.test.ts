import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveOutputPath, writeFileOutput } from '../output/file.js'

describe('resolveOutputPath()', () => {
  it('substitutes {{SESSION_ID}} in the path template', () => {
    const result = resolveOutputPath('/retros/{{SESSION_ID}}.md', 'abc-123')
    expect(result).toBe('/retros/abc-123.md')
  })

  it('substitutes multiple occurrences of {{SESSION_ID}}', () => {
    const result = resolveOutputPath('/{{SESSION_ID}}/{{SESSION_ID}}.md', 'xyz')
    expect(result).toBe('/xyz/xyz.md')
  })

  it('leaves the path unchanged when no token is present', () => {
    const result = resolveOutputPath('/retros/output.md', 'abc-123')
    expect(result).toBe('/retros/output.md')
  })

  it('handles an empty sessionId', () => {
    const result = resolveOutputPath('/retros/{{SESSION_ID}}.md', '')
    expect(result).toBe('/retros/.md')
  })

  it('handles a session ID with special characters in regex context', () => {
    const result = resolveOutputPath('{{SESSION_ID}}.md', 'a.b-c')
    expect(result).toBe('a.b-c.md')
  })
})

describe('writeFileOutput()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'retroloop-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes content to the resolved path', () => {
    const pathTemplate = join(tmpDir, 'output.md')
    writeFileOutput({ pathTemplate, sessionId: 'sess-1', content: 'hello world' })
    expect(readFileSync(pathTemplate, 'utf8')).toBe('hello world')
  })

  it('substitutes {{SESSION_ID}} in the file path', () => {
    const pathTemplate = join(tmpDir, '{{SESSION_ID}}.md')
    writeFileOutput({ pathTemplate, sessionId: 'sess-42', content: 'data' })
    const expected = join(tmpDir, 'sess-42.md')
    expect(existsSync(expected)).toBe(true)
    expect(readFileSync(expected, 'utf8')).toBe('data')
  })

  it('creates parent directories if they do not exist', () => {
    const pathTemplate = join(tmpDir, 'nested', 'deep', '{{SESSION_ID}}.md')
    writeFileOutput({ pathTemplate, sessionId: 'sess-7', content: 'nested content' })
    const expected = join(tmpDir, 'nested', 'deep', 'sess-7.md')
    expect(existsSync(expected)).toBe(true)
    expect(readFileSync(expected, 'utf8')).toBe('nested content')
  })

  it('writes empty content without error', () => {
    const pathTemplate = join(tmpDir, 'empty.md')
    writeFileOutput({ pathTemplate, sessionId: 'sess-x', content: '' })
    expect(readFileSync(pathTemplate, 'utf8')).toBe('')
  })

  it('overwrites an existing file', () => {
    const pathTemplate = join(tmpDir, 'output.md')
    writeFileOutput({ pathTemplate, sessionId: 's', content: 'first' })
    writeFileOutput({ pathTemplate, sessionId: 's', content: 'second' })
    expect(readFileSync(pathTemplate, 'utf8')).toBe('second')
  })
})
