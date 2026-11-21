/**
 * Optional server-side recognition function (reference implementation).
 *
 * This file is NOT part of the Vite build and is NOT required by the app. It is
 * a template for the opt-in cloud path: deploy it as a serverless function at
 * `/api/recognize`, set `VITE_RECOGNITION_PROVIDER=ai`, and the browser adapter
 * will call this endpoint instead of the local heuristic provider.
 *
 * The API key lives here, in the server environment, and never reaches the
 * client. All provider-specific details live here too, so swapping models or
 * providers does not touch app code.
 *
 * Environment (server only — do NOT prefix with VITE_):
 *   RECOGNITION_API_KEY                     required
 *   RECOGNITION_API_URL                     default https://api.openai.com/v1/chat/completions
 *   RECOGNITION_MODEL                       default gpt-4o-mini
 *   RECOGNITION_ALLOWED_ORIGINS             optional comma-separated CORS allowlist
 *   RECOGNITION_RATE_LIMIT_PER_MINUTE       optional, default 20; 0 disables
 *
 * Security notes:
 *   - The body cap is enforced before JSON parsing, and the decoded image is
 *     checked against a 4 MB ceiling and a real image signature (not just the
 *     client's MIME label).
 *   - The in-memory rate limiter is a best-effort integration point for a single
 *     instance. A public deployment MUST also configure a platform/distributed
 *     limiter, a provider spending cap, and authentication or another abuse
 *     control. CORS is not authentication.
 *   - The upstream timeout (15 s) is intentionally shorter than the browser
 *     timeout (20 s), so the function can return a safe error before the client
 *     aborts.
 *
 * Contract:
 *   POST { imageBase64: string, mimeType: string }
 *   200  { attributes, confidence }
 *   4xx  { error, code }
 *   5xx  { error, code }
 */

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
/** JSON/base64 envelope ceiling, checked before parsing. */
export const MAX_BODY_BYTES = 6 * 1024 * 1024
/** Default per-instance request budget. */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 20
export const TIMEOUT_MS = 15_000
export const ALLOWED_MIME = new Set(['image/webp', 'image/jpeg', 'image/png'])

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

export const SYSTEM_PROMPT = `You identify one garment from a single photo.
Respond with JSON only, matching this shape:
{
  "name": string | null,
  "category": "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory" | null,
  "subcategory": string | null,
  "colors": string[],
  "pattern": "solid" | "striped" | "plaid" | "checked" | "floral" | "graphic" | "polka-dot" | "camouflage" | "color-block" | null,
  "material": "cotton" | "linen" | "wool" | "denim" | "leather" | "silk" | "polyester" | "knit" | "suede" | "canvas" | "cashmere" | null,
  "fit": "slim" | "regular" | "oversized" | null,
  "formality": 1 | 2 | 3 | 4 | 5 | null,
  "warmth": 1 | 2 | 3 | 4 | 5 | null,
  "sleeve": "sleeveless" | "short" | "three-quarter" | "long" | null,
  "seasons": ("spring" | "summer" | "autumn" | "winter")[],
  "occasions": ("everyday" | "work" | "smart" | "formal" | "sport" | "evening" | "outdoor")[],
  "confidence": {
    "name": 0-1, "category": 0-1, "subcategory": 0-1, "colors": 0-1,
    "pattern": 0-1, "material": 0-1, "fit": 0-1, "formality": 0-1,
    "warmth": 0-1, "sleeve": 0-1, "seasons": 0-1, "occasions": 0-1
  }
}

Allowed subcategories:
- top: t-shirt, polo, shirt, blouse, sweater, hoodie, tank
- bottom: jeans, chinos, trousers, shorts, skirt, leggings
- dress: casual-dress, formal-dress
- outerwear: jacket, coat, blazer, puffer, cardigan
- shoes: sneakers, boots, sandals, loafers, heels
- accessory: scarf, hat, bag, belt, watch, sunglasses

Rules:
- Return null (or [] for lists) whenever the photo does not clearly support a value. Do not fill a field just because a plausible answer exists.
- Treat category, subcategory, pattern, and sleeve as visible observations. Only state material or fit when the photo unmistakably shows it. Do not guess fabric composition from color, drape, or styling. Brand, price, size, and fibre composition are never observable; leave them out.
- Formality and warmth are scoring estimates, not observed facts. Use null when the garment does not clearly support an estimate. Formality scale: 1 = loungewear/athleisure, 2 = casual everyday, 3 = smart casual, 4 = business/smart, 5 = formal/black tie. Warmth scale: 1 = very light, 2 = light, 3 = medium, 4 = warm, 5 = heavy.
- Seasons and occasions are contextual recommendations, not observed facts. Use an empty list when the item is not clearly suited to a season or occasion.
- A subcategory must belong to the category you choose.
- Colors are approximate six-digit hex suggestions for dominant colors, at most four. They do not replace measured colors.
- Name: a short descriptive label (max 80 characters), no brand or marketing language.
- Confidence must be your own 0-1 estimate of how clearly that attribute is visible. It is not a calibrated probability. Use 0 for a null/empty field. For formality, warmth, seasons, and occasions, confidence means how strongly the photo supports the recommendation.
- If no garment is visible or the image is unusable, return every attribute as null or [].
`

interface RateEntry {
  count: number
  resetAt: number
}

const rateEntries = new Map<string, RateEntry>()

export default async function handler(request: Request): Promise<Response> {
  const cors = corsFor(request)

  if (request.method === 'OPTIONS') {
    if (cors.rejected) {
      return json({ error: 'Origin is not allowed.', code: 'origin' }, 403)
    }
    return new Response(null, {
      status: 204,
      headers: { ...BASE_HEADERS, ...cors.headers },
    })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Use POST.', code: 'method' }, 405, cors.headers, {
      Allow: 'POST',
    })
  }

  if (cors.rejected) {
    return json({ error: 'Origin is not allowed.', code: 'origin' }, 403)
  }

  const rate = checkRateLimit(request)
  if (!rate.allowed) {
    return json(
      {
        error: 'Too many recognition requests. Try again shortly.',
        code: 'rate_limit',
      },
      429,
      cors.headers,
      { 'Retry-After': String(rate.retryAfter) },
    )
  }

  const apiKey = process.env.RECOGNITION_API_KEY
  if (!apiKey) {
    return json(
      {
        error: 'Recognition is not configured on the server.',
        code: 'not_configured',
      },
      503,
      cors.headers,
    )
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.tooLarge
      ? json(
          { error: 'Request body is too large.', code: 'too_large' },
          413,
          cors.headers,
        )
      : json(
          { error: 'Body must be valid JSON.', code: 'bad_request' },
          400,
          cors.headers,
        )
  }

  const { imageBase64, mimeType } = (body.value ?? {}) as {
    imageBase64?: unknown
    mimeType?: unknown
  }

  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return json(
      { error: 'imageBase64 is required.', code: 'bad_request' },
      400,
      cors.headers,
    )
  }
  if (typeof mimeType !== 'string' || !ALLOWED_MIME.has(mimeType)) {
    return json(
      { error: 'Unsupported image type.', code: 'unsupported_type' },
      415,
      cors.headers,
    )
  }

  const bytes = decodeBase64(imageBase64)
  if (!bytes) {
    return json(
      { error: 'imageBase64 is not valid base64.', code: 'bad_request' },
      400,
      cors.headers,
    )
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return json(
      { error: 'Image is too large.', code: 'too_large' },
      413,
      cors.headers,
    )
  }

  // Never trust the client's MIME label: check the actual file signature.
  if (sniffImageMime(bytes) !== mimeType) {
    return json(
      { error: 'Image content does not match the declared type.', code: 'unsupported_type' },
      415,
      cors.headers,
    )
  }

  const endpoint =
    process.env.RECOGNITION_API_URL ??
    'https://api.openai.com/v1/chat/completions'
  const model = process.env.RECOGNITION_MODEL ?? 'gpt-4o-mini'

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, TIMEOUT_MS)

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Identify this garment.' },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${imageBase64}` },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    })

    if (upstream.status === 401 || upstream.status === 403) {
      return json(
        {
          error: 'The server key was rejected by the vision provider.',
          code: 'auth',
        },
        502,
        cors.headers,
      )
    }

    if (upstream.status === 429) {
      return json(
        {
          error: 'The vision provider is rate-limiting this server.',
          code: 'rate_limit',
        },
        429,
        cors.headers,
        { 'Retry-After': upstream.headers.get('retry-after') ?? '30' },
      )
    }

    if (upstream.status === 504) {
      return json(
        { error: 'The vision provider timed out.', code: 'timeout' },
        504,
        cors.headers,
      )
    }

    if (
      !upstream.ok &&
      (upstream.status < 500 ||
        upstream.status === 501 ||
        upstream.status === 505)
    ) {
      return json(
        {
          error: `The vision provider rejected the request (${upstream.status}).`,
          code: 'upstream_permanent',
        },
        502,
        cors.headers,
      )
    }

    if (!upstream.ok) {
      return json(
        {
          error: `The vision provider declined the request (${upstream.status}).`,
          code: 'upstream',
        },
        502,
        cors.headers,
      )
    }

    try {
      const payload = (await upstream.json()) as {
        choices?: { message?: { content?: unknown } }[]
      }
      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        return json(
          { error: 'The provider returned no content.', code: 'upstream' },
          502,
          cors.headers,
        )
      }

      // The function trusts nothing from the model: it parses to an object and
      // returns it; the client then validates every field against the schema and
      // drops unknown values. Malformed JSON is a provider error, not a crash.
      let attributes: unknown
      try {
        attributes = JSON.parse(content)
      } catch {
        return json(
          { error: 'The provider returned malformed JSON.', code: 'malformed' },
          502,
          cors.headers,
        )
      }

      if (
        typeof attributes !== 'object' ||
        attributes === null ||
        Array.isArray(attributes)
      ) {
        return json(
          {
            error: 'The provider returned an unusable payload.',
            code: 'malformed',
          },
          502,
          cors.headers,
        )
      }

      const { confidence, ...rest } = attributes as Record<string, unknown>
      return json(
        {
          attributes: rest,
          confidence:
            typeof confidence === 'object' && confidence ? confidence : {},
        },
        200,
        cors.headers,
      )
    } catch {
      // This also covers a body that stalls after the headers arrive: the same
      // timer aborts the stream, so the function still answers before the
      // browser's 20-second deadline.
      return timedOut
        ? json(
            { error: 'The vision provider timed out.', code: 'timeout' },
            504,
            cors.headers,
          )
        : json(
            { error: 'The provider response could not be read.', code: 'upstream' },
            502,
            cors.headers,
          )
    }
  } catch {
    return timedOut
      ? json(
          { error: 'The vision provider timed out.', code: 'timeout' },
          504,
          cors.headers,
        )
      : json(
          { error: 'The vision provider could not be reached.', code: 'upstream' },
          502,
          cors.headers,
        )
  } finally {
    clearTimeout(timer)
  }
}

interface CorsResult {
  rejected: boolean
  headers: Record<string, string>
}

function corsFor(request: Request): CorsResult {
  const configured = (process.env.RECOGNITION_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)

  // Same-origin deployments need no CORS headers. If an allowlist is set, it is
  // enforced for browser requests; this is not authentication.
  if (configured.length === 0) return { rejected: false, headers: {} }

  const origin = request.headers.get('origin')
  if (!origin) return { rejected: false, headers: {} }
  if (!configured.includes(origin)) return { rejected: true, headers: {} }

  return {
    rejected: false,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  }
}

function checkRateLimit(
  request: Request,
):
  | { allowed: true }
  | { allowed: false; retryAfter: number } {
  const limit = rateLimitPerMinute()
  if (limit <= 0) return { allowed: true }

  const now = Date.now()
  const key = clientKey(request)
  let entry = rateEntries.get(key)

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + 60_000 }
    rateEntries.set(key, entry)
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    }
  }

  entry.count += 1

  // Keep the map bounded in a long-lived instance.
  if (rateEntries.size > 1000) {
    for (const [entryKey, value] of rateEntries) {
      if (value.resetAt <= now) rateEntries.delete(entryKey)
    }
  }

  return { allowed: true }
}

function rateLimitPerMinute(): number {
  const raw = process.env.RECOGNITION_RATE_LIMIT_PER_MINUTE
  if (raw === undefined) return DEFAULT_RATE_LIMIT_PER_MINUTE
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_RATE_LIMIT_PER_MINUTE
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') ?? 'unknown'
}

type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; tooLarge: boolean }

async function readJsonBody(request: Request): Promise<BodyResult> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, tooLarge: true }
  }

  if (!request.body) return { ok: false, tooLarge: false }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BODY_BYTES) {
        await reader.cancel()
        return { ok: false, tooLarge: true }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, tooLarge: false }
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) }
  } catch {
    return { ok: false, tooLarge: false }
  }
}

function decodeBase64(value: string): Uint8Array | null {
  const normalized = value.replace(/\s/g, '')
  if (normalized.length === 0 || normalized.length % 4 === 1) return null
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null

  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

function sniffImageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg'
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  return null
}

function json(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string> = {},
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...extraHeaders,
    },
  })
}
