import { Command } from 'commander'
import { registerReader, selectReader } from './readers/registry.js'
import { renderManifest } from './readers/manifest.js'
import { claudeSessionReader } from './readers/claude/index.js'

// Register all available Session Readers
registerReader(claudeSessionReader)

const program = new Command()

program
  .name('retroloop')
  .description('Collect a Claude Code session and run a developer prompt against it')
  .version('0.1.0')
  .option('--claude-session-id <id>', 'Claude Code session UUID to process')
  .action(async (options: { claudeSessionId?: string }) => {
    const presentFlags = new Set<string>()

    if (options.claudeSessionId !== undefined) {
      presentFlags.add('--claude-session-id')
    }

    const reader = selectReader(presentFlags)

    if (reader === null) {
      if (presentFlags.size === 0) {
        console.error('Error: no provider flag given. Use --claude-session-id <id>.')
      } else {
        console.error('Error: no reader registered for the given provider flag.')
      }
      process.exit(1)
    }

    const sessionId = options.claudeSessionId as string
    const cwd = process.cwd()

    try {
      const { manifest, markdown } = await reader.read({ sessionId, cwd })
      const header = renderManifest(manifest)
      process.stdout.write(header + markdown)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Error: ${message}`)
      process.exit(1)
    }
  })

program.parse()
