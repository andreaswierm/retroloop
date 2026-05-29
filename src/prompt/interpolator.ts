/**
 * Token substitution for retroloop prompt templates.
 *
 * User-facing tokens available in --prompt-file templates:
 *   {{SESSION_ID}}, {{DATE}}, {{PROJECT_NAME}}, {{PROVIDER}}
 *
 * Internal token (not available in user templates):
 *   {{SESSION_CONTENT}} — replaced with the Formatted Session Markdown
 */

export interface PromptContext {
  SESSION_ID: string
  DATE: string          // YYYY-MM-DD
  PROJECT_NAME: string  // basename of CWD
  PROVIDER: string
}

/**
 * Substitutes user-facing tokens in a prompt template.
 * Unknown/missing tokens are left as-is.
 * {{SESSION_CONTENT}} is deliberately not substituted here — use
 * injectSessionContent() for that step.
 */
export function interpolate(template: string, context: PromptContext): string {
  return template
    .replace(/\{\{SESSION_ID\}\}/g, context.SESSION_ID)
    .replace(/\{\{DATE\}\}/g, context.DATE)
    .replace(/\{\{PROJECT_NAME\}\}/g, context.PROJECT_NAME)
    .replace(/\{\{PROVIDER\}\}/g, context.PROVIDER)
}

/**
 * Injects the session content (Formatted Session or Summarized Session)
 * into the {{SESSION_CONTENT}} token. This is an internal step, called
 * after interpolate() so that {{SESSION_CONTENT}} is never exposed to or
 * processed by user prompt templates.
 */
export function injectSessionContent(prompt: string, sessionContent: string): string {
  return prompt.replace(/\{\{SESSION_CONTENT\}\}/g, sessionContent)
}
