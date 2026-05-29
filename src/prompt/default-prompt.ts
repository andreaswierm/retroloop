/**
 * Bundled default retrospective prompt.
 * Exported as a constant so it is embedded in the compiled bundle —
 * no runtime file-system access required.
 *
 * User-facing tokens: {{SESSION_ID}}, {{DATE}}, {{PROJECT_NAME}}, {{PROVIDER}}
 * Internal token:     {{SESSION_CONTENT}} (injected by the pipeline, not exposed to users)
 */
export const DEFAULT_PROMPT = `You are reviewing a Claude Code session transcript. Produce a retrospective covering:

Session ID: {{SESSION_ID}}
Date: {{DATE}}
Project: {{PROJECT_NAME}}
Provider: {{PROVIDER}}

1. **Summary** — what was accomplished in 2-3 sentences
2. **Friction** — moments where the AI struggled, went in the wrong direction,
   or needed correction. For each: what happened, why it was friction, what a
   better approach would have been.
3. **Decisions** — key architectural or design decisions made
4. **Next Steps** — concrete, actionable items that follow from this session

Be specific. Reference actual events from the transcript. Avoid generic advice.

Session transcript:
---
{{SESSION_CONTENT}}
`
