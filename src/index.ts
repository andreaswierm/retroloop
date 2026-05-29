import { Command } from 'commander'
import { registerReader, selectReader } from './readers/registry.js'
import { claudeSessionReader } from './readers/claude/index.js'
import { loadPrompt } from './prompt/loader.js'
import { interpolate, injectSessionContent } from './prompt/interpolator.js'
import { runClaude } from './runner/index.js'
import { checkSignificance } from './gate/index.js'
import { summarize, DEFAULT_SUMMARIZER_MODEL, DEFAULT_SUMMARIZER_THRESHOLD_CHARS } from './summarizer/index.js'
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
  .option('--min-session-chars <n>', 'Sessions with fewer chars than this are skipped (default: 1000)', '1000')
  .option('--force', 'Bypass the significance gate regardless of session size')
  .option('--summarizer-model <model>', `Model for the summarization pass (default: ${DEFAULT_SUMMARIZER_MODEL})`, DEFAULT_SUMMARIZER_MODEL)
  .option('--summarizer-threshold-chars <n>', `Session size above which summarization runs (default: ${DEFAULT_SUMMARIZER_THRESHOLD_CHARS})`, String(DEFAULT_SUMMARIZER_THRESHOLD_CHARS))
  .action(async (options: { claudeSessionId?: string; promptFile?: string; model?: string; minSessionChars?: string; force?: boolean; summarizerModel?: string; summarizerThresholdChars?: string }) => {
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

      // Significance gate — skip trivial sessions before incurring any Runner cost
      const minSessionChars = parseInt(options.minSessionChars ?? '1000', 10)
      const gateResult = checkSignificance({
        bodyChars: markdown.length,
        minSessionChars,
        force: options.force === true,
      })
      if (!gateResult.pass) {
        process.stderr.write(`retroloop: ${gateResult.reason}\n`)
        process.exit(0)
      }

      // Step 2: Summarize (conditional) — replaces body when body exceeds threshold
      const summarizerThresholdChars = parseInt(options.summarizerThresholdChars ?? String(DEFAULT_SUMMARIZER_THRESHOLD_CHARS), 10)
      const sumResult = await summarize({
        markdown,
        cwd,
        summarizerModel: options.summarizerModel,
        summarizerThresholdChars,
      })
      const sessionBody = sumResult.body
      manifest.summarized = sumResult.summarized

      // Step 3: Load prompt template
      const promptTemplate = await loadPrompt(options.promptFile)

      // Step 4: Interpolate user-facing tokens
      const interpolated = interpolate(promptTemplate, {
        SESSION_ID: manifest.sessionId,
        DATE: manifest.date,
        PROJECT_NAME: manifest.projectName ?? basename(cwd),
        PROVIDER: manifest.provider,
      })

      // Step 5: Inject session content (internal token — not exposed to user templates)
      const finalPrompt = injectSessionContent(interpolated, sessionBody)

      // Step 6: Run the Runner
      const result = await runClaude({
        prompt: finalPrompt,
        cwd,
        model: options.model,
      })

      // Step 7: Print Runner stdout verbatim
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
