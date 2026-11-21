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

export interface RecognitionRunOptions {
  /** Colors already measured locally, reused by the heuristic provider. */
  palette?: string[]
}

interface UseRecognitionValue {
  state: RecognitionState
  result: RecognitionResult | null
  warning: string | null
  error: string | null
  run: (image: Blob, options?: RecognitionRunOptions) => void
  retry: () => void
  reset: () => void
  /** Whether a recognized value for this field is worth flagging as unsure. */
  isLowConfidence: (field: RecognitionField) => boolean
}

interface PendingRun {
  image: Blob
  options: RecognitionRunOptions
}

const PREPARATION_WARNING =
  'The photo could not be prepared for the AI service, so only local colors were analyzed. Fill the other details by hand or try a different photo.'

/**
 * Drives recognition for the item form.
 *
 * Recognition is a convenience, never a requirement: it runs when a new photo
 * arrives (or when the user explicitly asks in edit mode), keeps the form fully
 * editable regardless of the outcome, and the heuristic provider guarantees a
 * usable local result. Selecting a new photo aborts the previous request so a
 * slow provider cannot fill the form after the photo has changed.
 */
export function useRecognition(
  applyResult: (result: RecognitionResult) => void,
): UseRecognitionValue {
  const [state, setState] = useState<RecognitionState>('idle')
  const [result, setResult] = useState<RecognitionResult | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runId = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const pending = useRef<PendingRun | null>(null)
  const applyRef = useRef(applyResult)

  useEffect(() => {
    applyRef.current = applyResult
  }, [applyResult])

  const execute = useCallback(
    async (image: Blob, options: RecognitionRunOptions) => {
      const request = runId.current + 1
      runId.current = request

      controller.current?.abort()
      const nextController = new AbortController()
      controller.current = nextController
      const { signal } = nextController

      setState('working')
      setError(null)
      setWarning(null)

      let outcome: RecognizeOutcome
      let preparationWarning: string | null = null

      try {
        let source: Blob | null = image
        if (isRemoteRecognitionEnabled()) {
          source = await prepareRecognitionImage(image)
        }
        if (runId.current !== request || signal.aborted) return

        // Never upload the original when downscaling failed: it may be huge or
        // in a format the endpoint rejects. Fall back to the local heuristic.
        if (source === null) preparationWarning = PREPARATION_WARNING

        outcome = await recognizeGarment(source ?? image, {
          signal,
          palette: options.palette,
          forceHeuristic: source === null,
        })
      } catch {
        if (runId.current !== request || signal.aborted) return
        setState('failed')
        setError('Could not analyze that photo. You can fill the details by hand.')
        return
      } finally {
        if (controller.current === nextController) controller.current = null
      }

      if (runId.current !== request || signal.aborted) return

      if (outcome.result) {
        setResult(outcome.result)
        applyRef.current(outcome.result)
        setState('ready')
        setWarning(preparationWarning ?? outcome.warning)
      } else {
        setState('failed')
        setError(outcome.warning ?? 'Recognition did not return anything useful.')
      }
    },
    [],
  )

  const run = useCallback(
    (image: Blob, options: RecognitionRunOptions = {}) => {
      pending.current = { image, options }
      void execute(image, options)
    },
    [execute],
  )

  const retry = useCallback(() => {
    if (pending.current) {
      void execute(pending.current.image, pending.current.options)
    }
  }, [execute])

  const reset = useCallback(() => {
    runId.current += 1
    controller.current?.abort()
    controller.current = null
    pending.current = null
    setState('idle')
    setResult(null)
    setWarning(null)
    setError(null)
  }, [])

  useEffect(() => {
    return () => {
      runId.current += 1
      controller.current?.abort()
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
