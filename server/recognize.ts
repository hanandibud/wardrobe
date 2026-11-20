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
 *   RECOGNITION_API_KEY   required
 *   RECOGNITION_API_URL   default https://api.openai.com/v1/chat/completions
 *   RECOGNITION_MODEL     default gpt-4o-mini
 *
 * Contract:
 *   POST { imageBase64: string, mimeType: string }
 *   200  { attributes, confidence }
 *   4xx  { error }
 *   5xx  { error }
 */

const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/webp', 'image/jpeg', 'image/png'])
const TIMEOUT_MS = 20_000

const SYSTEM_PROMPT = `You identify clothing from a single photo.
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
  "confidence": { "category": 0-1, "subcategory": 0-1, "pattern": 0-1, "material": 0-1, "fit": 0-1, "formality": 0-1, "warmth": 0-1, "sleeve": 0-1 }
}
Rules:
- Only state a material, pattern, or fit when the photo clearly shows it. Otherwise use null.
- Use six-digit hex strings for colors (e.g. "#1f2a44").
- Never guess a category you cannot see. Use null when unsure.
- Confidence must reflect how visible each attribute is.`

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Body must be JSON.' }, 400)
  }

  const { imageBase64, mimeType } = (body ?? {}) as {
    imageBase64?: unknown
    mimeType?: unknown
  }

  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return json({ error: 'imageBase64 is required.' }, 400)
  }
  if (typeof mimeType !== 'string' || !ALLOWED_MIME.has(mimeType)) {
    return json({ error: 'Unsupported image type.' }, 415)
  }
  // base64 is ~4/3 the byte length; reject before decoding.
  if (Math.ceil((imageBase64.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return json({ error: 'Image is too large.' }, 413)
  }

  const apiKey = process.env.RECOGNITION_API_KEY
  if (!apiKey) {
    return json({ error: 'Recognition is not configured on the server.' }, 503)
  }

  const endpoint =
    process.env.RECOGNITION_API_URL ?? 'https://api.openai.com/v1/chat/completions'
  const model = process.env.RECOGNITION_MODEL ?? 'gpt-4o-mini'

  let upstream: Response
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return json({ error: 'The vision provider could not be reached.' }, 502)
  }

  if (!upstream.ok) {
    return json(
      { error: `The vision provider declined the request (${upstream.status}).` },
      502,
    )
  }

  try {
    const payload = (await upstream.json()) as {
      choices?: { message?: { content?: unknown } }[]
    }
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return json({ error: 'The provider returned no content.' }, 502)
    }

    // The function trusts nothing from the model: it parses to an object and
    // returns it; the client then validates every field against the schema and
    // drops unknown values. Malformed JSON is a provider error, not a crash.
    let attributes: unknown
    try {
      attributes = JSON.parse(content)
    } catch {
      return json({ error: 'The provider returned malformed JSON.' }, 502)
    }

    if (typeof attributes !== 'object' || attributes === null) {
      return json({ error: 'The provider returned an unusable payload.' }, 502)
    }

    const { confidence, ...rest } = attributes as Record<string, unknown>
    return json(
      {
        attributes: rest,
        confidence: typeof confidence === 'object' && confidence ? confidence : {},
      },
      200,
    )
  } catch {
    return json({ error: 'The provider response could not be read.' }, 502)
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
