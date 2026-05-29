import { Command } from 'commander'
import { registerReader, selectReader } from './readers/registry.js'
import { claudeSessionReader } from './readers/claude/index.js'
import { loadPrompt } from './prompt/loader.js'
import { interpolate, injectSessionContent } from './prompt/interpolator.js'
import { runClaude } from './runner/index.js'
import { checkSignificance } from './gate/index.js'
import { summarize, DEFAULT_SUMMARIZER_MODEL, DEFAULT_SUMMARIZER_THRESHOLD_CHARS } from './summarizer/index.js'
import { writeFileOutput } from './output/file.js'
import { detectGithubRepo, createGithubIssue, interpolateTitle } from './output/github-issue.js'
import { readHookPayload } from './hook/index.js'
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
  .option('--output-file <path>', 'Write runner output to this path. Supports {{SESSION_ID}} substitution')
  .option('--create-issue', 'Create a GitHub issue with the runner output as the body')
  .option('--github-repo <owner/repo>', 'GitHub repository (owner/repo). Auto-detected from git remote origin if not set')
  .option('--github-labels <labels>', 'Comma-separated labels for the created issue (default: retroloop)', 'retroloop')
  .option('--github-title <template>', 'Title template for the created issue. Supports {{SESSION_ID}} and {{DATE}} (default: "Retro: {{SESSION_ID}} — {{DATE}}")', 'Retro: {{SESSION_ID}} — {{DATE}}')
  .action(async (options: { claudeSessionId?: string; promptFile?: string; model?: string; minSessionChars?: string; force?: boolean; summarizerModel?: string; summarizerThresholdChars?: string; outputFile?: string; createIssue?: boolean; githubRepo?: string; githubLabels?: string; githubTitle?: string }) => {
    // Detect Hook Mode: parse stdin payload before touching any flags
    const hookPayload = readHookPayload()

    let sessionId: string
    let cwd: string
    let transcriptPath: string | undefined
    let reader

    if (hookPayload !== null) {
      // Hook Mode: all inputs come from the stdin payload; Claude reader is always used
      sessionId = hookPayload.session_id
      transcriptPath = hookPayload.transcript_path
      cwd = hookPayload.cwd
      reader = claudeSessionReader
    } else {
      // Manual Mode: provider flag is required
      const presentFlags = new Set<string>()

      if (options.claudeSessionId !== undefined) {
        presentFlags.add('--claude-session-id')
      }

      reader = selectReader(presentFlags)

      if (reader === null) {
        if (presentFlags.size === 0) {
          console.error('Error: no provider flag given. Use --claude-session-id <id>.')
        } else {
          console.error('Error: no reader registered for the given provider flag.')
        }
        process.exit(1)
      }

      sessionId = options.claudeSessionId as string
      cwd = process.cwd()
    }

    try {
      // Step 1: Read + format session
      const { manifest, markdown } = await reader.read({ sessionId, cwd, transcriptPath })

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

      // Step 7: Print Runner stdout verbatim (always)
      process.stdout.write(result.stdout)

      // Step 8: Write to file if --output-file is set
      if (options.outputFile) {
        writeFileOutput({
          pathTemplate: options.outputFile,
          sessionId: manifest.sessionId,
          content: result.stdout,
        })
      }

      // Step 9: Create GitHub issue if --create-issue is set
      if (options.createIssue) {
        const repo = options.githubRepo ?? detectGithubRepo(cwd)
        const title = interpolateTitle(options.githubTitle ?? 'Retro: {{SESSION_ID}} — {{DATE}}', {
          sessionId: manifest.sessionId,
          date: manifest.date,
        })
        const issueUrl = createGithubIssue({
          repo,
          title,
          labels: options.githubLabels ?? 'retroloop',
          body: result.stdout,
        })
        process.stderr.write(`retroloop: created issue ${issueUrl}\n`)
      }

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
