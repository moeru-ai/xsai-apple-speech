import type {
  AppleSpeechLoadProgress,
  AppleSpeechProvider,
  AppleSpeechProviderOperations,
  AppleSpeechUnavailableReason,
} from '@xsai-apple-speech/transcription'

import type {
  NativeBinding,
  RawNativeAddon,
} from './types'

import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { arch } from 'node:process'
import {
  createAbortError,
  createAppleSpeechProvider as createSharedAppleSpeechProvider,
} from '@xsai-apple-speech/transcription'
import { createNativeBinding } from './native-addon'
import { parseOptions } from './transcribers/options'

interface CreateAppleSpeechProviderOptions {
  addon?: RawNativeAddon
}

const require = createRequire(import.meta.url)

function loadNativeAddon(): RawNativeAddon {
  return require(
    `@xsai-apple-speech/transcription-native-darwin-${arch}`,
  ) as RawNativeAddon
}

async function runCancelable<T>(options: {
  abortSignal: AbortSignal | undefined
  cancel: () => Promise<void>
  operation: () => Promise<T>
}): Promise<T> {
  options.abortSignal?.throwIfAborted()
  let abortListener: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    if (options.abortSignal == null)
      return

    /**
     * Cancels native work after the caller aborts the public operation.
     *
     * Triggering workflow:
     *
     * `AbortSignal.abort`
     *   -> abortListener
     *     -> `options.cancel`
     *
     * Upstream:
     * - The caller-owned {@link AbortSignal}
     *
     * Downstream:
     * - The operation-specific native cancellation callback
     */
    abortListener = () => {
      const reason = options.abortSignal?.reason
        ?? createAbortError('The Apple Speech operation was canceled.')
      void options.cancel().then(() => reject(reason), reject)
    }
    options.abortSignal.addEventListener('abort', abortListener, { once: true })
  })

  try {
    const operation = options.operation().then(
      value => options.abortSignal?.aborted ? aborted : value,
      error => options.abortSignal?.aborted ? aborted : Promise.reject(error),
    )
    return await Promise.race([operation, aborted])
  }
  finally {
    if (abortListener != null)
      options.abortSignal?.removeEventListener('abort', abortListener)
  }
}

/**
 * Creates an Apple Speech Provider backed by the Darwin native addon.
 *
 * Import and Provider construction do not load the addon. The first
 * availability or transcription operation loads it.
 */
export function createAppleSpeechProvider(
  options: CreateAppleSpeechProviderOptions = {},
): AppleSpeechProvider {
  let binding: NativeBinding | undefined

  const resolveBinding = (): NativeBinding => {
    if (binding != null)
      return binding

    binding = createNativeBinding(options.addon ?? loadNativeAddon())
    return binding
  }

  const operations: AppleSpeechProviderOperations = {
    async generate(request) {
      const nativeBinding = resolveBinding()
      const operationId = randomUUID()
      return runCancelable({
        abortSignal: request.abortSignal,
        cancel: () => nativeBinding.cancelOperation(operationId),
        operation: () => nativeBinding.generate(
          operationId,
          request.audio,
          request.locale,
          parseOptions(request, 'file'),
          request.fileName,
          request.mediaType,
        ),
      })
    },
    async getLocales(transcriber) {
      return resolveBinding().getLocales(transcriber)
    },
    async isAvailable(transcriber) {
      const nativeBinding = resolveBinding()
      if (await nativeBinding.isAvailable(transcriber))
        return { available: true }

      const reason: AppleSpeechUnavailableReason = {
        code: 'framework-unavailable',
        message: `The ${transcriber} Apple Speech transcriber is unavailable on this Mac.`,
      }
      return { available: false, reason }
    },
    async load(loadOptions) {
      const nativeBinding = resolveBinding()
      const operationId = randomUUID()
      let active = true
      let progress = Promise.resolve()
      const publish = (value: AppleSpeechLoadProgress) => {
        progress = progress.then(async () => {
          if (active)
            await loadOptions.onProgress?.(value)
        })
        void progress.catch(() => {})
      }

      try {
        await runCancelable({
          abortSignal: loadOptions.abortSignal,
          cancel: () => nativeBinding.cancelLoad(operationId),
          operation: () => nativeBinding.load(
            operationId,
            loadOptions.locale,
            loadOptions.transcriber,
            publish,
          ),
        })
        publish({ locale: loadOptions.locale, status: 'ready' })
        await progress
      }
      finally {
        active = false
      }
    },
    async start(request) {
      const nativeBinding = resolveBinding()
      const sessionId = randomUUID()
      await runCancelable({
        abortSignal: request.abortSignal,
        cancel: () => nativeBinding.cancelStream(sessionId),
        operation: () => nativeBinding.startStream(
          sessionId,
          request.locale,
          request.inputSampleRate,
          parseOptions(request, 'stream'),
          event => void request.onPartial(event),
        ),
      })

      return {
        dispose: () => nativeBinding.cancelStream(sessionId),
        finish: () => nativeBinding.finishStream(sessionId),
        write: samples => nativeBinding.writeStream(sessionId, samples),
      }
    },
  }

  return createSharedAppleSpeechProvider(operations)
}
