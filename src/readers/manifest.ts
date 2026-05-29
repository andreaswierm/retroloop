import type { SessionManifest } from './types.js'

/**
 * Renders a Session Manifest as a Markdown header block.
 * This header is prepended to every Formatted Session regardless of provider.
 */
export function renderManifest(manifest: SessionManifest): string {
  const lines: string[] = [
    '---',
    `provider: ${manifest.provider}`,
  ]

  if (manifest.cliVersion !== undefined) {
    lines.push(`cli-version: ${manifest.cliVersion}`)
  }

  lines.push(`session-id: ${manifest.sessionId}`)
  lines.push(`project: ${manifest.projectName}`)
  lines.push(`date: ${manifest.date}`)

  if (manifest.model !== undefined) {
    lines.push(`model: ${manifest.model}`)
  }

  lines.push(`turns: ${manifest.turnCount}`)
  lines.push(`subagents: ${manifest.subagentCount}`)
  lines.push(`summarized: ${manifest.summarized}`)
  lines.push('---')
  lines.push('')

  return lines.join('\n')
}
