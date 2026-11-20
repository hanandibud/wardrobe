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
import type { RecognitionProvider, RecognitionResult } from './types'

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
  confidence: {
    category: 0.9,
    subcategory: 0.8,
    pattern: 0.7,
    material: 0.5,
    fit: 0.6,
    formality: 0.75,
    warmth: 0.4,
    sleeve: 0.85,
  },
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
    category: 0,
    subcategory: 0,
    pattern: 0,
    material: 0,
    fit: 0,
    formality: 0,
    warmth: 0,
    sleeve: 0,
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

  it('retries once before falling back when the ai provider keeps failing', async () => {
    const recognize = vi.fn().mockRejectedValue(new Error('Provider exploded'))
    mockAiProvider(recognize)
    vi.mocked(heuristicProvider.recognize).mockResolvedValue(fallbackResult())

    const { result, warning } = await recognizeGarment(image)

    expect(recognize).toHaveBeenCalledTimes(2)
    expect(result?.source).toBe('heuristic')
    expect(warning).toMatch(/unavailable/i)
  })

  it('retries and succeeds without warning when the first attempt was transient', async () => {
    const recognize = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(aiResult())
    mockAiProvider(recognize)

    const { result, warning } = await recognizeGarment(image)

    expect(recognize).toHaveBeenCalledTimes(2)
    expect(warning).toBeNull()
    expect(result?.source).toBe('ai')
  })

  it('treats a timeout as a failure and falls back to the heuristic', async () => {
    mockAiProvider(
      vi
        .fn()
        .mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError')),
    )
    vi.mocked(heuristicProvider.recognize).mockResolvedValue(fallbackResult())

    const { result, warning } = await recognizeGarment(image)

    expect(result?.source).toBe('heuristic')
    expect(warning).toMatch(/took too long|timed out/i)
  })

  it('surfaces a warning when the ai returns no usable attributes', async () => {
    mockAiProvider(
      vi
        .fn()
        .mockRejectedValue(new Error('Recognition returned no usable attributes.')),
    )
    vi.mocked(heuristicProvider.recognize).mockResolvedValue(fallbackResult())

    const { result, warning } = await recognizeGarment(image)

    expect(result?.source).toBe('heuristic')
    expect(warning).toMatch(/no usable attributes/i)
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
  })
})
