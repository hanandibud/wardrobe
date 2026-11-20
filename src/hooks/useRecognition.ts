import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isRemoteRecognitionEnabled,
  recognizeGarment,
  type RecognizeOutcome,
} from '../lib/recognition/client'
import { prepareRecognitionImage } from '../lib/recognition/image'
import {
  isLowConfidence,
  type RecognitionField,
  type RecognitionResult,
} from '../lib/recognition/types'

export type RecognitionState = 'idle' | 'working' | 'ready' | 'failed'

interface UseRecognitionValue {
  state: RecognitionState
  result: RecognitionResult | null
  warning: string | null
  error: string | null
  run: (image: Blob) => void
  retry: () => void
  reset: () => void
  /** Whether a recognized value for this field is worth flagging as unsure. */
  isLowConfidence: (field: RecognitionField) => boolean
}

/**
 * Drives recognition for the item form.
 *
 * Recognition is a convenience, never a requirement: it auto-runs once when a
 * photo arrives, keeps the form fully editable regardless of the outcome, and
 * the heuristic provider guarantees a usable result even with no network. A
 * stale run is dropped so rapid photo changes cannot fill the form twice.
 */
export function useRecognition(
  applyResult: (result: RecognitionResult) => void,
): UseRecognitionValue {
  const [state, setState] = useState<RecognitionState>('idle')
  const [result, setResult] = useState<RecognitionResult | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runId = useRef(0)
  const applyRef = useRef(applyResult)

  useEffect(() => {
    applyRef.current = applyResult
  }, [applyResult])

  // The image blob currently being recognized, so retry can re-run it.
  const pendingImage = useRef<Blob | null>(null)

  const execute = useCallback(
    async (image: Blob) => {
      const request = runId.current + 1
      runId.current = request

      setState('working')
      setError(null)
      setWarning(null)

      let outcome: RecognizeOutcome
      try {
        const source = isRemoteRecognitionEnabled()
          ? await prepareRecognitionImage(image)
          : image
        if (runId.current !== request) return
        outcome = await recognizeGarment(source)
      } catch {
        if (runId.current !== request) return
        setState('failed')
        setError('Could not analyze that photo. You can fill the details by hand.')
        return
      }

      if (runId.current !== request) return

      if (outcome.result) {
        setResult(outcome.result)
        applyRef.current(outcome.result)
        setState('ready')
        setWarning(outcome.warning)
      } else {
        setState('failed')
        setError(outcome.warning ?? 'Recognition did not return anything useful.')
      }
    },
    [],
  )

  const run = useCallback(
    (image: Blob) => {
      pendingImage.current = image
      void execute(image)
    },
    [execute],
  )

  const retry = useCallback(() => {
    if (pendingImage.current) {
      void execute(pendingImage.current)
    }
  }, [execute])

  const reset = useCallback(() => {
    runId.current += 1
    pendingImage.current = null
    setState('idle')
    setResult(null)
    setWarning(null)
    setError(null)
  }, [])

  useEffect(() => {
    return () => {
      runId.current += 1
    }
  }, [])

  return {
    state,
    result,
    warning,
    error,
    run,
    retry,
    reset,
    isLowConfidence: (field) => isLowConfidence(result, field),
  }
}
