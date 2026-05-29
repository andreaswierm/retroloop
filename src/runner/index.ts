import { spawn, spawnSync } from 'node:child_process'

/**
 * Checks whether the `claude` CLI is available on PATH.
 *
 * Throws a clear, actionable error when it is not found.
 */
export function assertClaudeCli(): void {
  const result = spawnSync('claude', ['--version'], { encoding: 'utf8' })
  if (result.error != null || result.status === null) {
    throw new Error(
      'claude CLI not found. Install it from https://claude.ai/download'
    )
  }
}

/**
 * Options for the Runner.
 */
export interface RunnerOptions {
  /** The final interpolated prompt to pass to `claude -p` */
  prompt: string
  /** Project CWD — the runner is spawned from here so it inherits
   *  the project's .claude/settings.json (ADR 0001). */
  cwd: string
  /** Optional model selection — passed as `--model <model>` if set. */
  model?: string
}

/**
 * Result returned by the Runner.
 */
export interface RunnerResult {
  stdout: string
  exitCode: number
}

/**
 * Spawns `claude -p "<prompt>"` from the given project CWD.
 *
 * Per ADR 0001:
 * - Always invoked from the project's CWD so `.claude/settings.json` is inherited.
 * - Never passes `--allowedTools` — tool access is delegated to the project config.
 *
 * Runner stdout is collected and returned verbatim.
 */
export async function runClaude(options: RunnerOptions): Promise<RunnerResult> {
  assertClaudeCli()

  const { prompt, cwd, model } = options

  const args = ['-p', prompt]
  if (model !== undefined) {
    args.push('--model', model)
  }

  return new Promise<RunnerResult>((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd,
      // inherit stderr so the user sees warnings/errors from claude CLI
      stdio: ['ignore', 'pipe', 'inherit'],
    })

    const stdoutChunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk)
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn claude CLI: ${err.message}`))
    })

    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        exitCode: code ?? 1,
      })
    })
  })
}
