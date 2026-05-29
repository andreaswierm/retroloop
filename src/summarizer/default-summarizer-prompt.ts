/**
 * Bundled summarizer prompt.
 *
 * This prompt is passed to the cheap model along with the full session body.
 * It is not user-configurable — the summarizer is an internal pipeline step.
 */
export const DEFAULT_SUMMARIZER_PROMPT = `Condense the following developer session transcript into a focused summary.

Preserve:
- Key decisions made (architectural, design, or implementation choices)
- Friction points (where the AI struggled, went in the wrong direction, or needed correction)
- Outcomes (what was built, fixed, or resolved)
- Any important context needed to understand the session's results

Omit:
- Repetitive tool call/result cycles
- Trivial file reads and directory listings
- Incremental debug attempts that didn't affect the final outcome

Output the summary in plain Markdown. Be specific and concise — aim for roughly 20% of the original length.

Session transcript:
---
`
