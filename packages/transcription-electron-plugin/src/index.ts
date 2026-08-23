import type { EventContext } from '@moeru/eventa'
import type { AppleSpeechProvider, AppleSpeechProviderOperations, PartialTranscriptionEvent, TranscriptionResult } from '@xsai-apple-speech/transcription'

import type { AppleSpeechProtocolError, StreamInputFrame } from './events'

import {
  defineInvoke,
  defineStreamInvoke,
} from '@moeru/eventa'
import {
  AppleSpeechUnavailableError,
  createAbortError,
  createAppleSpeechProvider as createSharedAppleSpeechProvider,
} from '@xsai-apple-speech/transcription'

import {
  appleSpeechGenerate,
  appleSpeechGetLocales,
  appleSpeechIsAvailable,
  appleSpeechLoad,
  appleSpeechStream,
} from './events'

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
  void promise.catch(() => {})
  return { promise, reject, resolve }
}

function reconstructError(error: unknown): unknown {
  if (error != null
    && typeof error === 'object'
    && 'reason' in error
    && 'type' in error
    && error.type === 'apple-speech-unavailable') {
    return new AppleSpeechUnavailableError((error as AppleSpeechProtocolError).reason)
  }

  return error
}

async function withReconstructedError<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation
  }
  catch (error) {
    throw reconstructError(error)
  }
}

/**
 * Creates an Apple Speech Provider for an Electron renderer Eventa context.
 *
 * The Provider sends all native work to the main-process setup. It does not
 * import Electron or the native addon.
 */
export function createAppleSpeechProvider<EmitOptions>(options: {
  context: EventContext<undefined, EmitOptions>
}): AppleSpeechProvider {
  const invokeAvailability = defineInvoke(options.context, appleSpeechIsAvailable)
  const invokeLocales = defineInvoke(options.context, appleSpeechGetLocales)
  const invokeLoad = defineStreamInvoke(options.context, appleSpeechLoad)
  const invokeGenerate = defineInvoke(options.context, appleSpeechGenerate)
  const invokeStream = defineStreamInvoke(options.context, appleSpeechStream)

  const operations: AppleSpeechProviderOperations = {
    generate: request => withReconstructedError(invokeGenerate({
      audio: request.audio,
      ...(request.analysisContext == null
        ? {}
        : { analysisContext: request.analysisContext }),
      ...(request.fileName == null ? {} : { fileName: request.fileName }),
      locale: request.locale,
      ...(request.mediaType == null ? {} : { mediaType: request.mediaType }),
      ...(request.options == null ? {} : { options: request.options }),
      transcriber: request.transcriber,
    }, request.abortSignal == null ? {} : { signal: request.abortSignal })),
    getLocales: transcriber => withReconstructedError(invokeLocales({ transcriber })),
    isAvailable: transcriber => withReconstructedError(invokeAvailability({ transcriber })),
    async load(loadOptions) {
      const stream = invokeLoad(
        { locale: loadOptions.locale, transcriber: loadOptions.transcriber },
        loadOptions.abortSignal == null ? {} : { signal: loadOptions.abortSignal },
      )
      try {
        for await (const progress of stream)
          await loadOptions.onProgress?.(progress)
      }
      catch (error) {
        throw reconstructError(error)
      }
    },
    async start(request) {
      const requestTransform = new TransformStream<StreamInputFrame, StreamInputFrame>()
      const writer = requestTransform.writable.getWriter()
      const invocationController = new AbortController()
      const result = createDeferred<TranscriptionResult>()
      let doneEvent: TranscriptionResult | undefined

      /**
       * Forwards public session cancellation to the Eventa invocation.
       *
       * Triggering workflow:
       *
       * `StartAppleSpeechRequest.abortSignal`
       *   -> abortFromSession
       *     -> {@link AbortController.abort}
       *
       * Upstream:
       * - The shared transcription session
       *
       * Downstream:
       * - The renderer-side Eventa invocation
       */
      const abortFromSession = () => {
        invocationController.abort(
          request.abortSignal.reason
          ?? createAbortError('The Transcription Session was canceled.'),
        )
      }
      if (request.abortSignal.aborted)
        abortFromSession()
      else
        request.abortSignal.addEventListener('abort', abortFromSession, { once: true })

      const response = invokeStream(requestTransform.readable, {
        signal: invocationController.signal,
      })
      const responsePump = (async () => {
        try {
          for await (const event of response) {
            if (event.type === 'transcript.text.partial') {
              await request.onPartial(event as PartialTranscriptionEvent)
              continue
            }
            doneEvent = {
              locale: event.locale,
              ...(event.results == null ? {} : { results: event.results }),
              text: event.text,
            }
          }
          if (doneEvent == null)
            throw new Error('The Apple Speech stream ended without a done event.')
          result.resolve(doneEvent)
        }
        catch (error) {
          result.reject(reconstructError(error))
          throw error
        }
      })()
      void responsePump.catch(() => {})

      await writer.write({
        ...(request.analysisContext == null
          ? {}
          : { analysisContext: request.analysisContext }),
        channelCount: 1,
        inputSampleRate: request.inputSampleRate,
        locale: request.locale,
        ...(request.options == null ? {} : { options: request.options }),
        sampleFormat: 'float32',
        transcriber: request.transcriber,
        type: 'start',
      })

      return {
        async dispose(reason) {
          request.abortSignal.removeEventListener('abort', abortFromSession)
          invocationController.abort(reason)
          await writer.abort(reason).catch(() => {})
          await responsePump.catch(() => {})
        },
        async finish() {
          request.abortSignal.removeEventListener('abort', abortFromSession)
          await writer.close()
          await responsePump
          return result.promise
        },
        write(samples) {
          return writer.write({ samples, type: 'audio' })
        },
      }
    },
  }

  return createSharedAppleSpeechProvider(operations)
}

export * from './events'
export * from '@xsai-apple-speech/transcription'
