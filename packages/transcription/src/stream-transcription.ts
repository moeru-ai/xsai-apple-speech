import type {
  AppleSpeechRequestConfiguration,
  AppleSpeechSessionOperations,
  PartialTranscriptionEvent,
  StartAppleSpeechRequest,
  StreamTranscriptionOptions,
  StreamTranscriptionResult,
  TranscriptionEvent,
  TranscriptionResult,
} from './types'

import { createAbortError } from './errors'

type TranscriptionSessionState
  = | 'starting'
    | 'active'
    | 'finishing'
    | 'disposing'
    | 'completed'
    | 'failed'
    | 'disposed'

interface Deferred<T> {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let reject: Deferred<T>['reject'] = () => {}
  let resolve: Deferred<T>['resolve'] = () => {}
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise
    resolve = resolvePromise
  })

  // Consumers can attach after immediate startup cancellation without causing
  // an unhandled-rejection report.
  void promise.catch(() => {})

  return { promise, reject, resolve }
}

function validateSamples(samples: Float32Array): void {
  if (!(samples instanceof Float32Array))
    throw new TypeError('Apple Speech live input requires a Float32Array.')

  for (const sample of samples) {
    if (!Number.isFinite(sample) || sample < -1 || sample > 1)
      throw new RangeError('Apple Speech live samples must be finite values in the range [-1, 1].')
  }
}

/**
 * Starts live Apple Speech transcription with writable PCM input.
 *
 * Each partial value replaces the preceding Partial Transcript. Close the
 * input for graceful completion, or call dispose() to cancel the session.
 */
export function streamTranscription(
  options: StreamTranscriptionOptions,
): StreamTranscriptionResult {
  if (!Number.isFinite(options.inputSampleRate) || options.inputSampleRate <= 0)
    throw new RangeError('Apple Speech inputSampleRate must be a positive number.')

  return options.startStream({
    ...(options.abortSignal == null ? {} : { abortSignal: options.abortSignal }),
    inputSampleRate: options.inputSampleRate,
  })
}

export function createStreamTranscriptionResult(options: {
  abortSignal?: AbortSignal
  inputSampleRate: number
  locale: string
  start: (
    request: Omit<StartAppleSpeechRequest, keyof AppleSpeechRequestConfiguration>,
  ) => Promise<AppleSpeechSessionOperations>
}): StreamTranscriptionResult {
  const abortController = new AbortController()
  const text = createDeferred<string>()
  const done = createDeferred<TranscriptionResult>()
  let state: TranscriptionSessionState = 'starting'
  let partialController: ReadableStreamDefaultController<string> | undefined
  let fullController: ReadableStreamDefaultController<TranscriptionEvent> | undefined
  let disposal: Promise<void> | undefined
  let cancellationReason: unknown
  let externalAbortListener: (() => void) | undefined

  const removeExternalAbortListener = (): void => {
    if (externalAbortListener == null)
      return
    options.abortSignal?.removeEventListener('abort', externalAbortListener)
    externalAbortListener = undefined
  }

  const partialStream = new ReadableStream<string>({
    start(controller) {
      partialController = controller
    },
  })
  const fullStream = new ReadableStream<TranscriptionEvent>({
    start(controller) {
      fullController = controller
    },
  })

  const publishPartial = async (event: PartialTranscriptionEvent): Promise<void> => {
    if (state !== 'active' && state !== 'finishing')
      return

    partialController?.enqueue(event.text)
    fullController?.enqueue(event)
  }

  const startup = options.start({
    abortSignal: abortController.signal,
    inputSampleRate: options.inputSampleRate,
    locale: options.locale,
    onPartial: publishPartial,
  }).then(async (session) => {
    if (state === 'disposing' || abortController.signal.aborted) {
      await session.dispose(cancellationReason)
      throw cancellationReason
    }

    state = 'active'
    return session
  }).catch((error: unknown) => {
    if (state !== 'disposing')
      fail(error)
    throw error
  })
  void startup.catch(() => {})

  function fail(error: unknown): void {
    if (state === 'completed' || state === 'disposed' || state === 'failed')
      return

    state = 'failed'
    removeExternalAbortListener()
    partialController?.error(error)
    fullController?.error(error)
    text.reject(error)
    done.reject(error)
  }

  async function failWithCleanup(
    error: unknown,
    session?: AppleSpeechSessionOperations,
  ): Promise<never> {
    disposal ??= session?.dispose(error) ?? Promise.resolve()
    try {
      await disposal
    }
    finally {
      fail(error)
    }
    throw error
  }

  async function disposeWithReason(reason: unknown): Promise<void> {
    if (state === 'completed' || state === 'disposed' || state === 'failed')
      return
    if (disposal != null)
      return disposal

    cancellationReason = reason
    state = 'disposing'
    abortController.abort(reason)
    disposal = (async () => {
      try {
        const session = await startup
        await session.dispose(reason)
      }
      catch {
        // Startup and late-session cleanup use the same cancellation path.
      }
      finally {
        state = 'disposed'
        removeExternalAbortListener()
        partialController?.error(reason)
        fullController?.error(reason)
        text.reject(reason)
        done.reject(reason)
      }
    })()
    return disposal
  }

  const input = new WritableStream<Float32Array>({
    async abort(reason) {
      await disposeWithReason(reason ?? createAbortError('The Transcription Session was disposed.'))
    },
    async close() {
      let session: AppleSpeechSessionOperations | undefined
      try {
        session = await startup
        if (abortController.signal.aborted)
          return

        state = 'finishing'
        const result = await session.finish()
        if (abortController.signal.aborted)
          return

        const event: TranscriptionEvent = {
          ...result,
          type: 'transcript.text.done',
        }
        fullController?.enqueue(event)
        partialController?.close()
        fullController?.close()
        state = 'completed'
        removeExternalAbortListener()
        text.resolve(result.text)
        done.resolve(result)
      }
      catch (error) {
        await failWithCleanup(error, session)
      }
    },
    async write(samples) {
      validateSamples(samples)
      let session: AppleSpeechSessionOperations | undefined
      try {
        session = await startup
        if (state !== 'active')
          throw cancellationReason ?? new Error('The Transcription Session does not accept audio.')

        await session.write(samples)
      }
      catch (error) {
        await failWithCleanup(error, session)
      }
    },
  })

  const dispose = async (): Promise<void> => {
    await disposeWithReason(createAbortError('The Transcription Session was disposed.'))
  }

  if (options.abortSignal != null) {
    if (options.abortSignal.aborted) {
      void disposeWithReason(options.abortSignal.reason ?? createAbortError('The Transcription Session was disposed.'))
    }
    else {
      /**
       * Disposes the session after its caller-owned signal aborts.
       *
       * Triggering workflow:
       *
       * `StreamTranscriptionOptions.abortSignal`
       *   -> externalAbortListener
       *     -> disposeWithReason
       *
       * Upstream:
       * - The caller-owned {@link AbortSignal}
       *
       * Downstream:
       * - The Provider session and all public result streams
       */
      externalAbortListener = () => {
        void disposeWithReason(options.abortSignal?.reason ?? createAbortError('The Transcription Session was disposed.'))
      }
      options.abortSignal.addEventListener('abort', externalAbortListener, { once: true })
    }
  }

  return {
    dispose,
    done: done.promise,
    fullStream,
    input,
    partialStream,
    text: text.promise,
  }
}
