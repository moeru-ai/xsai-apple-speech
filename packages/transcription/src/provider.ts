import type {
  AppleSpeechAvailability,
  AppleSpeechLocale,
  AppleSpeechProvider,
  AppleSpeechProviderOperations,
  AppleSpeechRequestConfiguration,
  AppleSpeechTranscriber,
  GetAppleSpeechLocalesOptions,
  LoadAppleSpeechOptions,
} from './types'

import { AppleSpeechUnavailableError } from './errors'
import { assertSupportedLocale, canonicalizeLocale, canonicalizeLocales } from './locale'
import { createStreamTranscriptionResult } from './stream-transcription'

const baseURL = new URL('https://xsai-apple-speech.invalid/v1/')

function getFileName(file: Blob): string | undefined {
  return 'name' in file && typeof file.name === 'string'
    ? file.name
    : undefined
}

/**
 * Creates the shared Apple Speech Provider around implementation operations.
 *
 * Native and Electron packages supply the operations. This function applies
 * locale, availability, batch-fetch, and live-session policy once.
 */
export function createAppleSpeechProvider(
  operations: AppleSpeechProviderOperations,
): AppleSpeechProvider {
  const isAvailable = async (
    options: GetAppleSpeechLocalesOptions = {},
  ): Promise<AppleSpeechAvailability> => operations.isAvailable(
    options.transcriber ?? 'automatic',
  )

  const getLocales = async (
    options: GetAppleSpeechLocalesOptions = {},
  ): Promise<AppleSpeechLocale[]> => {
    const transcriber = options.transcriber ?? 'automatic'
    await assertAvailable(operations, transcriber)
    return canonicalizeLocales(await operations.getLocales(transcriber))
  }

  const prepareLocale = async (
    locale: string,
    transcriber: AppleSpeechTranscriber,
  ): Promise<string> => {
    const canonicalLocale = canonicalizeLocale(locale)
    const locales = await getLocales({ transcriber })
    assertSupportedLocale(canonicalLocale, locales)
    return canonicalLocale
  }

  const load = async (options: LoadAppleSpeechOptions): Promise<void> => {
    options.abortSignal?.throwIfAborted()
    const transcriber = options.transcriber ?? 'automatic'
    const locale = await prepareLocale(options.locale, transcriber)
    options.abortSignal?.throwIfAborted()
    await operations.load({
      ...(options.abortSignal == null ? {} : { abortSignal: options.abortSignal }),
      locale,
      ...(options.onProgress == null ? {} : { onProgress: options.onProgress }),
      transcriber,
    })
  }

  return {
    getLocales,
    isAvailable,
    load,
    transcription(options) {
      const requestedLocale = canonicalizeLocale(options.locale)
      const configuration: AppleSpeechRequestConfiguration = {
        ...(options.analysisContext == null
          ? {}
          : { analysisContext: options.analysisContext }),
        ...(options.options == null ? {} : { options: options.options }),
        transcriber: options.transcriber ?? 'automatic',
      }

      return {
        baseURL,
        fetch: async (_input, init) => {
          if (!(init.body instanceof FormData))
            throw new TypeError('Apple Speech batch transcription requires multipart form data.')

          const file = init.body.get('file')
          if (!(file instanceof Blob))
            throw new TypeError('Apple Speech batch transcription requires one audio file.')

          const abortSignal = init.signal ?? undefined
          abortSignal?.throwIfAborted()
          const locale = await prepareLocale(
            requestedLocale,
            configuration.transcriber,
          )
          await operations.load({
            ...(abortSignal == null ? {} : { abortSignal }),
            locale,
            transcriber: configuration.transcriber,
          })
          abortSignal?.throwIfAborted()
          const result = await operations.generate({
            abortSignal,
            audio: new Uint8Array(await file.arrayBuffer()),
            ...configuration,
            fileName: getFileName(file),
            locale,
            mediaType: file.type || undefined,
          })
          return Response.json(result)
        },
        model: 'apple-speech',
        startStream: streamOptions => createStreamTranscriptionResult({
          ...(streamOptions.abortSignal == null
            ? {}
            : { abortSignal: streamOptions.abortSignal }),
          inputSampleRate: streamOptions.inputSampleRate,
          locale: requestedLocale,
          start: async (request) => {
            request.abortSignal.throwIfAborted()
            const locale = await prepareLocale(
              request.locale,
              configuration.transcriber,
            )
            await operations.load({
              abortSignal: request.abortSignal,
              locale,
              transcriber: configuration.transcriber,
            })
            request.abortSignal.throwIfAborted()
            return operations.start({
              ...request,
              ...configuration,
              locale,
            })
          },
        }),
      }
    },
  }
}

async function assertAvailable(
  operations: AppleSpeechProviderOperations,
  transcriber: AppleSpeechTranscriber,
): Promise<void> {
  const availability = await operations.isAvailable(transcriber)
  if (!availability.available)
    throw new AppleSpeechUnavailableError(availability.reason)
}
