import { createOpenAiCompatibleProvider } from './providers/openai-compatible'
import { heuristicProvider } from './providers/heuristic'
import type {
  RecognitionProvider,
  RecognitionResult,
} from './types'

export const RECOGNITION_TIMEOUT_MS = 20_000
const AI_MAX_ATTEMPTS = 2

/** Providers read from the environment. Defaults to the local heuristic. */
function resolveProviderName(): string {
  const value = readEnv('VITE_RECOGNITION_PROVIDER')
  return value && value.length > 0 ? value : 'heuristic'
}

/**
 * Read a Vite env var without importing `import.meta.env` at module scope, so
 * the module stays importable in tests that run outside Vite.
 */
function readEnv(key: string): string {
  const env = import.meta.env as Record<string, string | undefined> | undefined
  return env?.[key] ?? ''
}

export function getRecognitionProvider(): RecognitionProvider {
  if (resolveProviderName() === 'ai') {
    return createOpenAiCompatibleProvider()
  }
  return heuristicProvider
}

/**
 * Whether the active provider sends the photo off the device. The UI reads this
 * so the privacy copy stays truthful: with the default heuristic provider
 * nothing is uploaded, and with the AI provider it says so explicitly.
 */
export function isRemoteRecognitionEnabled(): boolean {
  return resolveProviderName() === 'ai'
}

export interface RecognizeOutcome {
  result: RecognitionResult | null
  /** Populated when recognition failed and the fallback was used. */
  warning: string | null
}

/**
 * Run recognition with a timeout, a bounded retry for transient AI failures,
 * and a guaranteed fallback to the local heuristic provider so the add flow
 * keeps working when a vision provider is unavailable.
 *
 * Never throws: a `null` result with a `warning` means "recognition did not
 * help", and the user still fills the form by hand.
 */
export async function recognizeGarment(
  image: Blob,
  options: { signal?: AbortSignal } = {},
): Promise<RecognizeOutcome> {
  const provider = getRecognitionProvider()

  if (provider.source === 'heuristic') {
    const result = await runProvider(provider, image, options.signal)
    return { result, warning: null }
  }

  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await runProvider(provider, image, options.signal)
      return { result, warning: null }
    } catch (error) {
      if (options.signal?.aborted) {
        return { result: null, warning: 'Recognition was cancelled.' }
      }

      if (attempt === AI_MAX_ATTEMPTS) {
        const fallback = await runProvider(heuristicProvider, image, options.signal)
        return {
          result: fallback,
          warning: describeAiFailure(error),
        }
      }
    }
  }

  // Exhaustiveness: the loop returns on every path; this satisfies the compiler.
  return { result: null, warning: 'Recognition is unavailable.' }
}

async function runProvider(
  provider: RecognitionProvider,
  image: Blob,
  signal?: AbortSignal,
): Promise<RecognitionResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RECOGNITION_TIMEOUT_MS)

  // Chain an external cancellation signal, if any, into the timeout controller.
  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort)

  try {
    return await provider.recognize({ image }, controller.signal)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}

function describeAiFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  if (/abort/i.test(message)) {
    return 'Recognition took too long and timed out. Fill the details by hand or retry.'
  }
  return `Recognition is unavailable right now. ${message} Fill the details by hand or retry.`
}
