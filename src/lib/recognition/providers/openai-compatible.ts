import type {
  RecognitionHint,
  RecognitionProvider,
  RecognitionResult,
} from '../types'
import { parseRecognitionResponse } from '../parse'

/**
 * Adapter for any OpenAI-compatible vision endpoint, reached through a small
 * serverless function at `/api/recognize`.
 *
 * The provider never talks to the model directly and never sees an API key:
 * the function holds the key server-side and forwards only the image plus a
 * prompt. This keeps `VITE_*` variables free of secrets and the client
 * provider-agnostic — swap the model by changing the function, not this code.
 *
 * The function contract:
 *   POST /api/recognize   body: { imageBase64, mimeType }
 *   200  -> { attributes: {...}, confidence: {...} }
 *   4xx  -> { error: string }        (validation, provider refused)
 *   5xx  -> { error: string }        (timeout, upstream failure)
 *
 * Off by default. Set `VITE_RECOGNITION_PROVIDER=ai` and deploy the function in
 * `api/recognize` to enable it; without the function the client falls back to
 * the local heuristic provider.
 */
export function createOpenAiCompatibleProvider(
  endpoint = '/api/recognize',
): RecognitionProvider {
  return {
    name: 'openai-compatible',
    source: 'ai',

    async recognize(
      hint: RecognitionHint,
      signal?: AbortSignal,
    ): Promise<RecognitionResult> {
      const imageBase64 = await blobToBase64(hint.image)
      const mimeType = hint.image.type || 'image/webp'

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
        signal,
      })

      if (!response.ok) {
        const detail = await readErrorMessage(response)
        throw new Error(
          `Recognition request failed with ${response.status}. ${detail}`,
        )
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new Error('Recognition returned a response that was not JSON.')
      }

      return parseRecognitionResponse(
        payload,
        this.name,
        this.source,
      )
    },
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  return bytesToBase64(new Uint8Array(buffer))
}

/** Base64 without pulling in a polyfill; works in browsers and Node 18+. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body?.error === 'string' && body.error.length > 0) {
      return body.error
    }
  } catch {
    // Fall through to a generic message.
  }
  return 'Check the recognition function logs for details.'
}
