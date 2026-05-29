import { Command } from 'commander'
import { registerReader, selectReader } from './readers/registry.js'
import { claudeSessionReader } from './readers/claude/index.js'
import { loadPrompt } from './prompt/loader.js'
import { interpolate, injectSessionContent } from './prompt/interpolator.js'
import { runClaude } from './runner/index.js'
import { basename } from 'node:path'

// Register all available Session Readers
registerReader(claudeSessionReader)

const program = new Command()

program
  .name('retroloop')
  .description('Collect a Claude Code session and run a developer prompt against it')
  .version('0.1.0')
  .option('--claude-session-id <id>', 'Claude Code session UUID to process')
  .option('--prompt-file <path>', 'Path to a custom prompt template (default: bundled retrospective prompt)')
  .option('--model <model>', 'Model for the main runner (default: claude CLI default)')
  .action(async (options: { claudeSessionId?: string; promptFile?: string; model?: string }) => {
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
      // Step 1: Read + format session
      const { manifest, markdown } = await reader.read({ sessionId, cwd })

      // Step 2: Load prompt template
      const promptTemplate = await loadPrompt(options.promptFile)

      // Step 3: Interpolate user-facing tokens
      const interpolated = interpolate(promptTemplate, {
        SESSION_ID: manifest.sessionId,
        DATE: manifest.date,
        PROJECT_NAME: manifest.projectName ?? basename(cwd),
        PROVIDER: manifest.provider,
      })

      // Step 4: Inject session content (internal token — not exposed to user templates)
      const finalPrompt = injectSessionContent(interpolated, markdown)

      // Step 5: Run the Runner
      const result = await runClaude({
        prompt: finalPrompt,
        cwd,
        model: options.model,
      })

      // Step 6: Print Runner stdout verbatim
      process.stdout.write(result.stdout)

      if (result.exitCode !== 0) {
        process.exit(result.exitCode)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Error: ${message}`)
      process.exit(1)
    }
  })

program.parse()
