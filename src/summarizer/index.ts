import { runClaude } from '../runner/index.js'
import { DEFAULT_SUMMARIZER_PROMPT } from './default-summarizer-prompt.js'

export const DEFAULT_SUMMARIZER_MODEL = 'claude-haiku-4-5-20251001'
export const DEFAULT_SUMMARIZER_THRESHOLD_CHARS = 50000

/**
 * Options for the summarize() function.
 */
export interface SummarizeOptions {
  /** The normalized session body (Markdown string) to condense. */
  markdown: string
  /** CWD to spawn the summarizer from (inherits project .claude/settings.json). */
  cwd: string
  /** Model to use for summarization. Defaults to DEFAULT_SUMMARIZER_MODEL. */
  summarizerModel?: string
  /** Character threshold above which summarization runs. */
  summarizerThresholdChars?: number
}

/**
 * Result of the summarize() call.
 */
export interface SummarizeResult {
  /** The (possibly condensed) body to pass to the Runner. */
  body: string
  /** Whether summarization was actually applied. */
  summarized: boolean
}

/**
 * Decides whether the session body exceeds the summarizer threshold.
 *
 * This is a pure helper — it has no side effects and can be unit-tested
 * without spawning any processes.
 */
export function shouldSummarize(
  bodyChars: number,
  thresholdChars: number
): boolean {
  return bodyChars > thresholdChars
}

/**
 * Conditionally summarizes a session body with a cheap model.
 *
 * If `markdown.length > summarizerThresholdChars`, runs `claude -p` with
 * the bundled summarizer prompt and returns the summary as the new body,
 * with `summarized: true`.
 *
 * Otherwise returns the original body unchanged with `summarized: false`.
 */
export async function summarize(options: SummarizeOptions): Promise<SummarizeResult> {
  const {
    markdown,
    cwd,
    summarizerModel = DEFAULT_SUMMARIZER_MODEL,
    summarizerThresholdChars = DEFAULT_SUMMARIZER_THRESHOLD_CHARS,
  } = options

  if (!shouldSummarize(markdown.length, summarizerThresholdChars)) {
    return { body: markdown, summarized: false }
  }

  const prompt = DEFAULT_SUMMARIZER_PROMPT + markdown

  const result = await runClaude({
    prompt,
    cwd,
    model: summarizerModel,
  })

  if (result.exitCode !== 0) {
    throw new Error(
      `Summarizer exited with code ${result.exitCode}. Check claude CLI output.`
    )
  }

  return { body: result.stdout, summarized: true }
}
