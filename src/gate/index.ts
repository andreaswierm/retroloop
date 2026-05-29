export interface SignificanceCheckOptions {
  bodyChars: number
  minSessionChars: number
  force: boolean
}

export interface SignificanceCheckResult {
  pass: boolean
  reason?: string
}

/**
 * Pure significance gate. Returns { pass: true } when the session is large
 * enough to warrant running the Runner, or when --force is set.
 *
 * No side-effects: callers are responsible for logging and exiting on failure.
 */
export function checkSignificance({
  bodyChars,
  minSessionChars,
  force,
}: SignificanceCheckOptions): SignificanceCheckResult {
  if (force) {
    return { pass: true }
  }

  if (bodyChars < minSessionChars) {
    return {
      pass: false,
      reason: `Session body is ${bodyChars} chars, below --min-session-chars threshold of ${minSessionChars}. Skipping retro.`,
    }
  }

  return { pass: true }
}
