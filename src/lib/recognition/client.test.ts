import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the heuristic provider module so the fallback path is deterministic in
// the node test environment (the real one needs a canvas for color extraction).
vi.mock('./providers/heuristic', () => ({
  heuristicProvider: {
    name: 'heuristic',
    source: 'heuristic',
    recognize: vi.fn(),
  },
}))

vi.mock('./providers/openai-compatible', () => ({
  createOpenAiCompatibleProvider: vi.fn(),
}))

import { recognizeGarment, getRecognitionProvider } from './client'
import { heuristicProvider } from './providers/heuristic'
import { createOpenAiCompatibleProvider } from './providers/openai-compatible'
import {
  RecognitionHttpError,
  type RecognitionProvider,
  type RecognitionResult,
} from './types'

const confidence = () => ({
  name: 0.9,
  category: 0.9,
  subcategory: 0.8,
  colors: 0.4,
  pattern: 0.7,
  material: 0.5,
  fit: 0.6,
  formality: 0.75,
  warmth: 0.4,
  sleeve: 0.85,
  seasons: 0.5,
  occasions: 0.4,
})

const aiResult = (): RecognitionResult => ({
  attributes: {
    nameSuggestion: 'Black cotton tee',
    category: 'top',
    subcategory: 't-shirt',
    colors: ['#151515'],
    pattern: 'solid',
    material: 'cotton',
    fit: 'regular',
    formality: 2,
    warmth: 2,
    sleeve: 'short',
    seasons: ['spring', 'summer'],
    occasions: ['everyday'],
  },
  confidence: confidence(),
  provider: 'openai-compatible',
  source: 'ai',
})

const fallbackResult = (): RecognitionResult => ({
  attributes: {
    nameSuggestion: null,
    category: null,
    subcategory: null,
    colors: ['#60704d', '#f6f3ee'],
    pattern: null,
    material: null,
    fit: null,
    formality: null,
    warmth: null,
    sleeve: null,
    seasons: [],
    occasions: [],
  },
  confidence: {
    name: 0,
    category: 0,
    subcategory: 0,
    colors: 0,
    pattern: 0,
    material: 0,
    fit: 0,
    formality: 0,
    warmth: 0,
    sleeve: 0,
    seasons: 0,
    occasions: 0,
  },
  provider: 'heuristic',
  source: 'heuristic',
})

const image = new Blob(['image-bytes'], { type: 'image/webp' })

// A default so tests that only select the provider never see undefined.
vi.mocked(createOpenAiCompatibleProvider).mockReturnValue({
  name: 'openai-compatible',
  source: 'ai',
  recognize: vi.fn(),
})

function mockAiProvider(recognize: RecognitionProvider['recognize']) {
  vi.mocked(createOpenAiCompatibleProvider).mockReturnValue({
    name: 'openai-compatible',
    source: 'ai',
    recognize,
  })
}

describe('getRecognitionProvider', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('defaults to the local heuristic provider when no env var is set', () => {
    vi.stubEnv('VITE_RECOGNITION_PROVIDER', '')
    expect(getRecognitionProvider().source).toBe('heuristic')
  })

  it('selects the ai provider when configured', () => {
    vi.stubEnv('VITE_RECOGNITION_PROVIDER', 'ai')
    expect(getRecognitionProvider().source).toBe('ai')
  })
})

describe('recognizeGarment with the ai provider', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_RECOGNITION_PROVIDER', 'ai')
    vi.mocked(heuristicProvider.recognize).mockResolvedValue(fallbackResult())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns the ai result for a valid recognition', async () => {
    mockAiProvider(vi.fn().mockResolvedValue(aiResult()))

    const { result, warning } = await recognizeGarment(image)

    expect(warning).toBeNull()
    expect(result?.source).toBe('ai')
    expect(result?.attributes.category).toBe('top')
    expect(result?.attributes.material).toBe('cotton')
  })

  it('retries a transient 5xx once and then succeeds', async () => {
    const recognize = vi
      .fn()
      .mockRejectedValueOnce(new RecognitionHttpError('busy', 502, 'upstream'))
      .mockResolvedValueOnce(aiResult())
    mockAiProvider(recognize)

    const { result, warning } = await recognizeGarment(image)

    expect(recognize).toHaveBeenCalledTimes(2)
    expect(warning).toBeNull()
    expect(result?.source).toBe('ai')
  })

  it('does not retry a permanent 400 and falls back', async () => {
    const recognize = vi
      .fn()
      .mockRejectedValue(new RecognitionHttpError('bad request', 400, 'bad_request'))
    mockAiProvider(recognize)

    const { result, warning } = await recognizeGarment(image)

    expect(recognize).toHaveBeenCalledTimes(1)
    expect(result?.source).toBe('heuristic')
    expect(warning).toMatch(/could not analyze|unavailable/i)
  })

  it('does not retry a permanent upstream rejection', async () => {
    const recognize = vi.fn().mockRejectedValue(
      new RecognitionHttpError('refused', 502, 'upstream_permanent'),
    )
    mockAiProvider(recognize)

    const { result, warning } = await recognizeGarment(image)

    expect(recognize).toHaveBeenCalledTimes(1)
    expect(result?.source).toBe('heuristic')
    expect(warning).toMatch(/refused/i)
  })

  it('treats an authentication failure as configuration, not a retry', async () => {
    const recognize = vi
      .fn()
      .mockRejectedValue(new RecognitionHttpError('bad key', 502, 'auth'))
    mockAiProvider(recognize)

    const { result, warning } = await recognizeGarment(image)

    expect(recognize).toHaveBeenCalledTimes(1)
    expect(result?.source).toBe('heuristic')
    expect(warning).toMatch(/not configured correctly/i)
  })

  it('surfaces a rate-limit message and does not retry', async () => {
    const recognize = vi.fn().mockRejectedValue(
      new RecognitionHttpError('slow down', 429, 'rate_limit', 12),
    )
    mockAiProvider(recognize)

    const { result, warning } = await recognizeGarment(image)

    expect(recognize).toHaveBeenCalledTimes(1)
    expect(result?.source).toBe('heuristic')
    expect(warning).toMatch(/about 12 seconds/i)
  })

  it('does not retry a timeout and falls back with a timeout warning', async () => {
    const recognize = vi.fn(
      (_hint, signal?: AbortSignal) =>
        new Promise<RecognitionResult>((_resolve, reject) => {
          // Real fetch rejects when its signal aborts. The client's own timeout
          // must convert that into a non-retryable timeout outcome.
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        }),
    )
    mockAiProvider(recognize)

    vi.useFakeTimers()
    const pending = recognizeGarment(image)
    await vi.advanceTimersByTimeAsync(20_000)
    const { result, warning } = await pending
    vi.useRealTimers()

    expect(recognize).toHaveBeenCalledTimes(1)
    expect(result?.source).toBe('heuristic')
    expect(warning).toMatch(/took too long|timed out/i)
  })

  it('retries a network failure once before falling back', async () => {
    const recognize = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    mockAiProvider(recognize)

    const { result, warning } = await recognizeGarment(image)

    expect(recognize).toHaveBeenCalledTimes(2)
    expect(result?.source).toBe('heuristic')
    expect(warning).toMatch(/unavailable/i)
  })

  it('cancels an in-flight request without falling back when the caller aborts', async () => {
    let seenSignal: AbortSignal | undefined
    const recognize = vi.fn(
      (_hint, signal?: AbortSignal) =>
        new Promise<RecognitionResult>((_resolve, reject) => {
          seenSignal = signal
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        }),
    )
    mockAiProvider(recognize)

    const controller = new AbortController()
    const pending = recognizeGarment(image, { signal: controller.signal })
    controller.abort()
    const { result, warning } = await pending

    expect(seenSignal?.aborted).toBe(true)
    expect(result).toBeNull()
    expect(warning).toMatch(/cancelled/i)
    expect(heuristicProvider.recognize).not.toHaveBeenCalled()
  })

  it('does no work when the signal is already aborted', async () => {
    const recognize = vi.fn()
    mockAiProvider(recognize)
    const controller = new AbortController()
    controller.abort()

    const { result, warning } = await recognizeGarment(image, {
      signal: controller.signal,
    })

    expect(result).toBeNull()
    expect(warning).toMatch(/cancelled/i)
    expect(recognize).not.toHaveBeenCalled()
    expect(heuristicProvider.recognize).not.toHaveBeenCalled()
  })

  it('never throws even when the heuristic fallback also fails', async () => {
    mockAiProvider(vi.fn().mockRejectedValue(new TypeError('offline')))
    vi.mocked(heuristicProvider.recognize).mockRejectedValue(
      new Error('no canvas'),
    )

    const { result, warning } = await recognizeGarment(image)

    expect(result).toBeNull()
    expect(warning).toMatch(/unavailable/i)
  })

  it('passes the measured palette to the heuristic fallback', async () => {
    mockAiProvider(vi.fn().mockRejectedValue(new TypeError('offline')))

    await recognizeGarment(image, { palette: ['#112233'] })

    expect(heuristicProvider.recognize).toHaveBeenCalledWith(
      expect.objectContaining({ palette: ['#112233'] }),
      expect.any(AbortSignal),
    )
  })
})

describe('recognizeGarment with the heuristic provider', () => {
  it('runs locally with no warning and never builds an ai provider', async () => {
    vi.stubEnv('VITE_RECOGNITION_PROVIDER', '')
    const factory = vi.mocked(createOpenAiCompatibleProvider)
    factory.mockClear()
    vi.mocked(heuristicProvider.recognize).mockResolvedValue(fallbackResult())

    const { result, warning } = await recognizeGarment(image)

    expect(warning).toBeNull()
    expect(result?.source).toBe('heuristic')
    expect(result?.attributes.colors).toEqual(['#60704d', '#f6f3ee'])
    expect(result?.attributes.category).toBeNull()
    expect(factory).not.toHaveBeenCalled()
    expect(heuristicProvider.recognize).toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
