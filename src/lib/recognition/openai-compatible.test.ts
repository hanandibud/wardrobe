import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenAiCompatibleProvider } from './providers/openai-compatible'

const image = new Blob(['image-bytes'], { type: 'image/webp' })
const provider = createOpenAiCompatibleProvider()

afterEach(() => vi.restoreAllMocks())

describe('openai-compatible provider', () => {
  it('sends the image to the endpoint and parses a valid response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          category: 'bottom',
          subcategory: 'jeans',
          colors: ['#4a6b8a'],
          confidence: { category: 0.9 },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await provider.recognize({ image })

    expect(result.source).toBe('ai')
    expect(result.attributes.category).toBe('bottom')
    expect(result.attributes.subcategory).toBe('jeans')
    expect(result.confidence.category).toBe(0.9)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/recognize')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.mimeType).toBe('image/webp')
    // The image is forwarded as base64 for the server-side function to forward.
    expect(typeof body.imageBase64).toBe('string')
    expect(body.imageBase64.length).toBeGreaterThan(0)
  })

  it('throws a readable error on a provider error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Upstream timed out.', code: 'timeout' }), {
          status: 504,
          headers: { 'Retry-After': '7' },
        }),
      ),
    )

    await expect(provider.recognize({ image })).rejects.toMatchObject({
      status: 504,
      code: 'timeout',
      retryAfterSeconds: 7,
    })
  })

  it('throws when the endpoint returns non-JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })),
    )

    await expect(provider.recognize({ image })).rejects.toThrow(/not JSON/i)
  })

  it('validates the response through the shared schema', async () => {
    // A response that names an impossible material must not reach the caller
    // as a guessed value; normalization turns it into null.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ category: 'top', material: 'spider-silk' }),
          { status: 200 },
        ),
      ),
    )

    const result = await provider.recognize({ image })

    expect(result.attributes.category).toBe('top')
    expect(result.attributes.material).toBeNull()
  })
})
