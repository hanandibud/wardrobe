import { createOpenAiCompatibleProvider } from './providers/openai-compatible'
import { heuristicProvider } from './providers/heuristic'
import {
  RecognitionHttpError,
  RecognitionTimeoutError,
  type RecognitionProvider,
  type RecognitionResult,
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
 * Run recognition with a timeout, a bounded retry for network/5xx failures,
 * and a guaranteed fallback to the local heuristic provider so the add flow
 * keeps working when a vision provider is unavailable.
 *
 * Permanent HTTP failures, rate limits, timeouts, and caller cancellations are
 * not retried: sending the same request again cannot help and only adds cost.
 *
 * Never throws: a `null` result with a `warning` means "recognition did not
 * help", and the user still fills the form by hand.
 */
export async function recognizeGarment(
  image: Blob,
  options: {
    signal?: AbortSignal
    palette?: string[]
    /** Skip the remote provider, e.g. when image preparation was unsafe. */
    forceHeuristic?: boolean
  } = {},
): Promise<RecognizeOutcome> {
  if (options.signal?.aborted) {
    return { result: null, warning: 'Recognition was cancelled.' }
  }

  const provider = options.forceHeuristic
    ? heuristicProvider
    : getRecognitionProvider()

  if (provider.source === 'heuristic') {
    try {
      const result = await runProvider(
        provider,
        image,
        options.signal,
        options.palette,
      )
      return { result, warning: null }
    } catch (error) {
      return {
        result: null,
        warning: describeHeuristicFailure(error),
      }
    }
  }

  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await runProvider(
        provider,
        image,
        options.signal,
        options.palette,
      )
      return { result, warning: null }
    } catch (error) {
      if (options.signal?.aborted) {
        return { result: null, warning: 'Recognition was cancelled.' }
      }

      const retryable = isRetryable(error)
      if (!retryable || attempt === AI_MAX_ATTEMPTS) {
        const fallback = await runHeuristicFallback(
          image,
          options.signal,
          options.palette,
        )
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

function isRetryable(error: unknown): boolean {
  if (error instanceof RecognitionHttpError) {
    // Authentication/configuration, rate limits, timeouts, and unusable
    // provider payloads are permanent in the short term. Other 5xx responses
    // are transient and safe to retry once.
    if (
      error.code === 'auth' ||
      error.code === 'rate_limit' ||
      error.code === 'timeout' ||
      error.code === 'malformed' ||
      error.code === 'not_configured' ||
      error.code === 'upstream_permanent' ||
      error.code === 'origin' ||
      error.status === 401 ||
      error.status === 403 ||
      error.status === 429 ||
      error.status === 504
    ) {
      return false
    }
    return error.status >= 500
  }

  // Timeouts and caller cancellations are not transient network failures.
  if (error instanceof RecognitionTimeoutError) return false
  if (error instanceof DOMException && error.name === 'AbortError') return false

  // fetch network failures surface as TypeError.
  return error instanceof TypeError
}

async function runHeuristicFallback(
  image: Blob,
  signal?: AbortSignal,
  palette?: string[],
): Promise<RecognitionResult | null> {
  try {
    return await runProvider(heuristicProvider, image, signal, palette)
  } catch {
    // The form stays usable with no recognition; this is not a hard failure.
    return null
  }
}

async function runProvider(
  provider: RecognitionProvider,
  image: Blob,
  signal?: AbortSignal,
  palette?: string[],
): Promise<RecognitionResult> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, RECOGNITION_TIMEOUT_MS)

  if (signal?.aborted) controller.abort()
  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort)

  try {
    return await provider.recognize({ image, palette }, controller.signal)
  } catch (error) {
    if (timedOut && !signal?.aborted) {
      throw new RecognitionTimeoutError()
    }
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}

function describeAiFailure(error: unknown): string {
  if (error instanceof RecognitionTimeoutError) {
    return 'Recognition took too long and timed out. Fill the details by hand or retry.'
  }

  if (error instanceof RecognitionHttpError) {
    if (error.code === 'origin') {
      return 'This site is not allowed to use the recognition service. Fill the details by hand or ask the site owner to check the allowed origins.'
    }
    if (error.code === 'auth' || error.status === 401 || error.status === 403) {
      return 'Recognition is not configured correctly (authentication failed). Fill the details by hand or ask the site owner to check the server key.'
    }
    if (error.code === 'not_configured') {
      return 'Recognition is not configured on the server. Fill the details by hand or ask the site owner to set it up.'
    }
    if (error.code === 'rate_limit' || error.status === 429) {
      const wait = error.retryAfterSeconds
      return wait
        ? `Recognition is rate-limited right now. Try again in about ${wait} seconds; the form still works by hand.`
        : 'Recognition is rate-limited right now. Wait a moment, then retry; the form still works by hand.'
    }
    if (error.code === 'timeout' || error.status === 504) {
      return 'Recognition timed out on the server. Fill the details by hand or retry.'
    }
    if (error.code === 'upstream_permanent') {
      return 'The recognition service refused this photo. Try a different image or fill the details by hand.'
    }
    if (error.status === 413) {
      return 'That photo is too large for the recognition service. Try a smaller photo or fill the details by hand.'
    }
    if (error.status === 415) {
      return 'The recognition service does not accept that image format. Try a WebP, JPEG, or PNG photo.'
    }
    if (error.status >= 500) {
      return 'Recognition is unavailable right now. Fill the details by hand or retry.'
    }
    return 'The recognition service could not analyze this photo. Fill the details by hand or try a different image.'
  }

  const message = error instanceof Error ? error.message : String(error)
  if (/abort/i.test(message)) {
    return 'Recognition was cancelled. Fill the details by hand or retry.'
  }
  return `Recognition is unavailable right now. ${message} Fill the details by hand or retry.`
}

function describeHeuristicFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `Could not analyze the photo locally. ${message} Fill the details by hand.`
}
