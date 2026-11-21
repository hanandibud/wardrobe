import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, {
  MAX_BODY_BYTES,
  MAX_IMAGE_BYTES,
  SYSTEM_PROMPT,
} from './recognize'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3wWQAAAABJRU5ErkJggg=='
const ENDPOINT = 'https://wardrobe.test/api/recognize'
const originalEnv = { ...process.env }

function post(
  body: unknown,
  options: { ip?: string; origin?: string; raw?: string } = {},
): Request {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': options.ip ?? '192.0.2.10',
      ...(options.origin ? { origin: options.origin } : {}),
    },
    body: options.raw ?? JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    imageBase64: PNG_BASE64,
    mimeType: 'image/png',
    ...overrides,
  }
}

function upstreamContent(attributes: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(attributes) } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

beforeEach(() => {
  process.env = { ...originalEnv }
  process.env.RECOGNITION_API_KEY = 'server-secret'
  process.env.RECOGNITION_RATE_LIMIT_PER_MINUTE = '0'
  delete process.env.RECOGNITION_ALLOWED_ORIGINS
  delete process.env.RECOGNITION_API_URL
  delete process.env.RECOGNITION_MODEL
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('server request validation', () => {
  it('rejects a non-POST method', async () => {
    const response = await handler(new Request(ENDPOINT, { method: 'GET' }))

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
    await expect(response.json()).resolves.toMatchObject({ code: 'method' })
  })

  it('rejects malformed JSON', async () => {
    const response = await handler(post(null, { raw: '{' }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'bad_request' })
  })

  it('rejects an unsupported declared MIME type', async () => {
    const response = await handler(post(validBody({ mimeType: 'text/plain' })))
    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({
      code: 'unsupported_type',
    })
  })

  it('rejects image content that does not match the declared type', async () => {
    const response = await handler(post(validBody({ mimeType: 'image/jpeg' })))
    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({
      code: 'unsupported_type',
    })
  })

  it('rejects invalid base64', async () => {
    const response = await handler(post(validBody({ imageBase64: 'not base64!' })))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'bad_request' })
  })

  it('rejects a decoded image over the 4 MB ceiling', async () => {
    const bytes = Buffer.alloc(MAX_IMAGE_BYTES + 1)
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const imageBase64 = bytes.toString('base64')

    const response = await handler(post(validBody({ imageBase64 })))
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({ code: 'too_large' })
  })

  it('rejects a JSON body over the body cap before parsing', async () => {
    const response = await handler(
      post(null, { raw: ' '.repeat(MAX_BODY_BYTES + 1) }),
    )
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({ code: 'too_large' })
  })

  it('reports a missing server key without calling the provider', async () => {
    delete process.env.RECOGNITION_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await handler(post(validBody()))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'not_configured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('server provider request', () => {
  it('forwards a constrained, keyed request and returns the envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      upstreamContent({
        category: 'top',
        subcategory: 'shirt',
        confidence: { category: 0.8 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await handler(post(validBody()))
    const body = (await response.json()) as {
      attributes: Record<string, unknown>
      confidence: Record<string, unknown>
    }

    expect(response.status).toBe(200)
    expect(body.attributes.category).toBe('top')
    expect(body.confidence.category).toBe(0.8)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer server-secret',
    )
    const payload = JSON.parse(init.body as string) as {
      max_tokens: number
      messages: { role: string; content: unknown }[]
    }
    expect(payload.max_tokens).toBe(500)
    expect(payload.messages[0].content).toBe(SYSTEM_PROMPT)
    expect(SYSTEM_PROMPT).toMatch(/Formality scale:/)
    expect(SYSTEM_PROMPT).toMatch(/not a calibrated probability/i)
    expect(SYSTEM_PROMPT).toMatch(/Return null/)
  })

  it('maps an upstream authentication failure to a safe configuration error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    )

    const response = await handler(post(validBody()))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ code: 'auth' })
  })

  it('marks an upstream 4xx as permanent rather than transient', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('bad model', { status: 400 })),
    )

    const response = await handler(post(validBody()))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      code: 'upstream_permanent',
    })
  })

  it('propagates a rate limit with Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('slow down', {
          status: 429,
          headers: { 'retry-after': '17' },
        }),
      ),
    )

    const response = await handler(post(validBody()))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('17')
    await expect(response.json()).resolves.toMatchObject({ code: 'rate_limit' })
  })

  it('maps other upstream failures to a transient error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 500 })),
    )

    const response = await handler(post(validBody()))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ code: 'upstream' })
  })

  it('rejects malformed model JSON without crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'not json' } }],
          }),
          { status: 200 },
        ),
      ),
    )

    const response = await handler(post(validBody()))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ code: 'malformed' })
  })

  it('rejects a model payload that is not an object', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '[]' } }],
          }),
          { status: 200 },
        ),
      ),
    )

    const response = await handler(post(validBody()))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ code: 'malformed' })
  })

  it('turns a provider timeout into a 504', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ),
    )

    vi.useFakeTimers()
    const pending = handler(post(validBody()))
    await vi.advanceTimersByTimeAsync(15_000)
    const response = await pending
    vi.useRealTimers()

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toMatchObject({ code: 'timeout' })
  })
})

describe('server abuse controls', () => {
  it('enforces the configured in-memory rate limit', async () => {
    process.env.RECOGNITION_RATE_LIMIT_PER_MINUTE = '1'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamContent({ category: 'top' })))
    const ip = '198.51.100.77'

    const first = await handler(post(validBody(), { ip }))
    const second = await handler(post(validBody(), { ip }))

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect(second.headers.get('retry-after')).toBeTruthy()
    await expect(second.json()).resolves.toMatchObject({ code: 'rate_limit' })
  })

  it('returns CORS headers only for an allowed origin', async () => {
    process.env.RECOGNITION_ALLOWED_ORIGINS = 'https://wardrobe.example'
    const response = await handler(
      new Request(ENDPOINT, {
        method: 'OPTIONS',
        headers: { origin: 'https://wardrobe.example' },
      }),
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://wardrobe.example',
    )
  })

  it('rejects a disallowed browser origin', async () => {
    process.env.RECOGNITION_ALLOWED_ORIGINS = 'https://wardrobe.example'

    const options = await handler(
      new Request(ENDPOINT, {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
      }),
    )
    const request = await handler(
      post(validBody(), { origin: 'https://evil.example' }),
    )

    expect(options.status).toBe(403)
    expect(request.status).toBe(403)
  })
})
