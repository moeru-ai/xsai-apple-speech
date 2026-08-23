import type { EventContext } from '@moeru/eventa'
import type {
  AppleSpeechProvider,
  TranscriptionResult,
} from '@xsai-apple-speech/transcription'

import type { AppleSpeechProtocolError, StreamInputFrame } from './events'

import {
  defineInvokeHandler,
  defineStreamInvokeHandler,
  isAsyncIterable,
  isReadableStream,
  toStreamHandler,
} from '@moeru/eventa'
import {
  AppleSpeechUnavailableError,
  createAbortError,
  streamTranscription,
} from '@xsai-apple-speech/transcription'
import { generateTranscription } from '@xsai/generate-transcription'

import {
  appleSpeechGenerate,
  appleSpeechGetLocales,
  appleSpeechIsAvailable,
  appleSpeechLoad,
  appleSpeechStream,
} from './events'

interface Sender {
  isDestroyed?: () => boolean
  once?: (event: 'destroyed', listener: () => void) => void
  removeListener?: (event: 'destroyed', listener: () => void) => void
}

interface InvocationOptions {
  abortController?: AbortController
  raw?: {
    ipcMainEvent?: {
      sender?: Sender
    }
  }
}

interface ActiveInvocation {
  abortController: AbortController
  done: Promise<void>
  finish: () => void
}

function serializeError(error: unknown): unknown {
  if (error instanceof AppleSpeechUnavailableError) {
    return {
      reason: error.reason,
      type: 'apple-speech-unavailable',
    } satisfies AppleSpeechProtocolError
  }

  return error
}

function getInvocationOptions(value: unknown): InvocationOptions {
  return value != null && typeof value === 'object'
    ? value as InvocationOptions
    : {}
}

function getInputStream(
  payload: StreamInputFrame | ReadableStream<StreamInputFrame> | AsyncIterable<StreamInputFrame>,
): AsyncIterable<StreamInputFrame> {
  if (isReadableStream<StreamInputFrame>(payload) || isAsyncIterable<StreamInputFrame>(payload))
    return payload
  throw new TypeError('The Apple Speech stream invoke requires streaming input.')
}

function assertStartFrame(
  frame: StreamInputFrame,
): asserts frame is Extract<StreamInputFrame, { type: 'start' }> {
  if (frame.type !== 'start'
    || frame.channelCount !== 1
    || frame.sampleFormat !== 'float32'
    || !Number.isFinite(frame.inputSampleRate)
    || frame.inputSampleRate <= 0) {
    throw new TypeError('The first Apple Speech stream frame must be a valid start frame.')
  }
}

/**
 * Registers the five Apple Speech invokes on one main-process Eventa context.
 *
 * The setup owns handler registrations and invocations that enter through
 * them. It does not own the Provider or Eventa context.
 *
 * Triggering workflow:
 *
 * Electron renderer Eventa invoke
 *   -> {@link setupAppleSpeechTranscription}
 *     -> {@link AppleSpeechProvider}
 *
 * Upstream:
 * - The renderer Eventa context
 *
 * Downstream:
 * - The configured {@link AppleSpeechProvider}
 */
export function setupAppleSpeechTranscription<
  Extensions,
  EmitOptions extends { raw?: unknown },
>(options: {
  context: EventContext<Extensions, EmitOptions>
  provider: AppleSpeechProvider
}): { dispose: () => Promise<void> } {
  const activeInvocations = new Set<ActiveInvocation>()
  let disposal: Promise<void> | undefined

  const beginInvocation = (rawOptions: unknown): ActiveInvocation => {
    const eventOptions = getInvocationOptions(rawOptions)
    const abortController = eventOptions.abortController ?? new AbortController()
    let finish = () => {}
    const done = new Promise<void>((resolve) => {
      finish = resolve
    })
    const invocation = { abortController, done, finish }
    activeInvocations.add(invocation)

    const sender = eventOptions.raw?.ipcMainEvent?.sender
    /**
     * Cancels work owned by a renderer after its Electron sender closes.
     *
     * Triggering workflow:
     *
     * `Sender.once('destroyed')`
     *   -> handleDestroyed
     *     -> {@link AbortController.abort}
     *
     * Upstream:
     * - `Sender.once('destroyed')`
     *
     * Downstream:
     * - {@link AbortController.abort}
     */
    const handleDestroyed = () => {
      abortController.abort(createAbortError('The renderer was destroyed.'))
    }
    sender?.once?.('destroyed', handleDestroyed)
    const originalFinish = invocation.finish
    invocation.finish = () => {
      sender?.removeListener?.('destroyed', handleDestroyed)
      activeInvocations.delete(invocation)
      originalFinish()
    }
    return invocation
  }

  const run = async <T>(
    rawOptions: unknown,
    operation: (abortSignal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    const invocation = beginInvocation(rawOptions)
    try {
      return await operation(invocation.abortController.signal)
    }
    catch (error) {
      throw serializeError(error)
    }
    finally {
      invocation.finish()
    }
  }

  const runStream = async function* <T>(
    rawOptions: unknown,
    operation: (abortSignal: AbortSignal) => AsyncGenerator<T, void, unknown>,
  ): AsyncGenerator<T, void, unknown> {
    const invocation = beginInvocation(rawOptions)
    try {
      yield* operation(invocation.abortController.signal)
    }
    catch (error) {
      throw serializeError(error)
    }
    finally {
      invocation.finish()
    }
  }

  const handlerDisposers = [
    defineInvokeHandler(options.context, appleSpeechIsAvailable, (payload, invokeOptions) =>
      run(invokeOptions, () => options.provider.isAvailable(payload))),
    defineInvokeHandler(options.context, appleSpeechGetLocales, (payload, invokeOptions) =>
      run(invokeOptions, () => options.provider.getLocales(payload))),
    defineInvokeHandler(options.context, appleSpeechGenerate, (payload, invokeOptions) =>
      run(invokeOptions, async (abortSignal) => {
        const { audio, fileName, mediaType, ...transcriptionOptions } = payload
        const file = new Blob(
          [audio.slice().buffer],
          mediaType == null ? {} : { type: mediaType },
        )
        const result = await generateTranscription({
          ...options.provider.transcription(transcriptionOptions),
          abortSignal,
          file,
          ...(fileName == null ? {} : { fileName }),
        })
        const providerResult: Partial<TranscriptionResult> = result
        return {
          locale: providerResult.locale ?? transcriptionOptions.locale,
          ...(providerResult.results == null ? {} : { results: providerResult.results }),
          text: result.text,
        }
      })),
    defineStreamInvokeHandler(options.context, appleSpeechLoad, toStreamHandler(async ({
      emit,
      options: invokeOptions,
      payload,
    }) => run(invokeOptions, abortSignal => options.provider.load({
      abortSignal,
      locale: payload.locale,
      onProgress: emit,
      transcriber: payload.transcriber,
    })))),
    defineStreamInvokeHandler(options.context, appleSpeechStream, async function* (
      payload,
      invokeOptions,
    ) {
      yield* runStream(invokeOptions, async function* (abortSignal) {
        const input = getInputStream(payload)
        const iterator = input[Symbol.asyncIterator]()
        const first = await iterator.next()
        if (first.done)
          throw new TypeError('The Apple Speech stream invoke ended before its start frame.')
        assertStartFrame(first.value)

        const live = streamTranscription({
          ...options.provider.transcription({
            ...(first.value.analysisContext == null
              ? {}
              : { analysisContext: first.value.analysisContext }),
            locale: first.value.locale,
            ...(first.value.options == null ? {} : { options: first.value.options }),
            transcriber: first.value.transcriber,
          }),
          abortSignal,
          inputSampleRate: first.value.inputSampleRate,
        })
        const writer = live.input.getWriter()
        const inputPump = (async () => {
          for (;;) {
            const next = await iterator.next()
            if (next.done)
              break
            if (next.value.type !== 'audio')
              throw new TypeError('The Apple Speech stream invoke accepts one start frame.')
            await writer.write(next.value.samples)
          }
          await writer.close()
        })()
        // Cancellation can reject the request iterator while the response loop
        // still waits for native cleanup. Observe it immediately, then await the
        // same promise below to preserve cleanup and error propagation order.
        void inputPump.catch(() => {})

        try {
          for await (const event of live.fullStream)
            yield event
          await inputPump
        }
        catch (error) {
          await writer.abort(error).catch(() => {})
          throw error
        }
        finally {
          await live.dispose()
          await inputPump.catch(() => {})
        }
      })
    }),
  ]

  return {
    dispose() {
      disposal ??= (async () => {
        for (const disposeHandler of handlerDisposers)
          disposeHandler()

        const invocations = [...activeInvocations]
        for (const invocation of invocations) {
          invocation.abortController.abort(
            createAbortError('The Apple Speech Electron setup was disposed.'),
          )
        }
        await Promise.all(invocations.map(invocation => invocation.done))
      })()
      return disposal
    },
  }
}
