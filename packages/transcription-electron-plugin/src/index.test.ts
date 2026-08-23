import type { AppleSpeechProviderOperations } from '@xsai-apple-speech/transcription'
import { createContext, defineInvokeHandler, linkChannel } from '@moeru/eventa'
import {
  AppleSpeechUnavailableError,
  createAbortError,
  createAppleSpeechProvider as createSharedProvider,
} from '@xsai-apple-speech/transcription'
import { generateTranscription } from '@xsai/generate-transcription'
import { describe, expect, it, vi } from 'vitest'

import { appleSpeechIsAvailable } from './events'
import { createAppleSpeechProvider } from './index'
import { setupAppleSpeechTranscription } from './main'

function createOperations(): AppleSpeechProviderOperations {
  return {
    generate: vi.fn(async ({ locale }) => ({ locale, text: 'remote batch' })),
    getLocales: vi.fn(async () => [{ installed: false, locale: 'en-US' }]),
    isAvailable: vi.fn(async () => ({ available: true as const })),
    load: vi.fn(async ({ locale, onProgress }) => {
      await onProgress?.({ locale, progress: 50, status: 'progress' })
      await onProgress?.({ locale, status: 'ready' })
    }),
    start: vi.fn(async ({ locale, onPartial }) => ({
      dispose: vi.fn(async () => {}),
      finish: vi.fn(async () => ({ locale, text: 'remote final' })),
      write: vi.fn(async () => {
        await onPartial({
          locale,
          range: {
            durationMilliseconds: 100,
            isFinal: false,
            startMilliseconds: 0,
          },
          text: 'remote partial',
          type: 'transcript.text.partial',
        })
      }),
    })),
  }
}

function createConnectedProviders() {
  const mainContext = createContext()
  const rendererContext = createContext()
  const channel = linkChannel(mainContext, rendererContext)
  const operations = createOperations()
  const setup = setupAppleSpeechTranscription({
    context: mainContext,
    provider: createSharedProvider(operations),
  })
  const provider = createAppleSpeechProvider({ context: rendererContext })

  return { channel, mainContext, operations, provider, setup }
}

describe('electron Eventa Provider', () => {
  // ROOT CAUSE:
  //
  // The plugin converted every Error into a plain protocol object.
  // The renderer then created a different Error from that object.
  //
  // We now encode only AppleSpeechUnavailableError because its reason needs
  // explicit transport support. Eventa propagates other Error objects.
  it('preserves generic Provider errors', async () => {
    const { channel, operations, provider, setup } = createConnectedProviders()
    const error = new TypeError('Native package load failed.')
    operations.isAvailable = vi.fn(async () => {
      throw error
    })

    await expect(provider.isAvailable()).rejects.toBe(error)
    await setup.dispose()
    channel.dispose()
  })

  it('reconstructs Apple Speech unavailable errors', async () => {
    const { channel, operations, provider, setup } = createConnectedProviders()
    operations.getLocales = vi.fn(async () => {
      throw new AppleSpeechUnavailableError({
        code: 'framework-unavailable',
        message: 'Apple Speech is unavailable.',
      })
    })

    await expect(provider.getLocales()).rejects.toBeInstanceOf(AppleSpeechUnavailableError)
    await setup.dispose()
    channel.dispose()
  })

  it('projects availability, locales, load progress, and batch transcription', async () => {
    const { channel, operations, provider, setup } = createConnectedProviders()
    const progress: string[] = []

    await expect(provider.isAvailable()).resolves.toEqual({ available: true })
    await expect(provider.getLocales()).resolves.toEqual([
      { installed: false, locale: 'en-US' },
    ])
    await provider.load({
      locale: 'en-US',
      onProgress(value) {
        progress.push(value.status)
      },
    })
    const result = await generateTranscription({
      ...provider.transcription({ locale: 'en-US' }),
      file: new Blob(['encoded'], { type: 'audio/wav' }),
      fileName: 'speech.wav',
    })

    expect(progress).toEqual(['progress', 'ready'])
    expect(result.text).toBe('remote batch')
    expect(operations.generate).toHaveBeenCalledWith(expect.objectContaining({
      transcriber: 'automatic',
    }))
    await setup.dispose()
    channel.dispose()
  })

  it('carries automatic overrides through Eventa', async () => {
    const { channel, operations, provider, setup } = createConnectedProviders()
    const transcription = provider.transcription({
      analysisContext: {
        contextualStrings: {
          general: ['xsAI'],
        },
      },
      locale: 'en-US',
      options: {
        contentHints: {
          atypicalSpeech: true,
        },
        reporting: {
          preferFastResults: false,
          preferFrequentFinalization: true,
        },
      },
    })

    await generateTranscription({
      ...transcription,
      file: new Blob(['encoded'], { type: 'audio/wav' }),
    })

    expect(operations.generate).toHaveBeenCalledWith(expect.objectContaining({
      analysisContext: {
        contextualStrings: {
          general: ['xsAI'],
        },
      },
      options: {
        contentHints: {
          atypicalSpeech: true,
        },
        reporting: {
          preferFastResults: false,
          preferFrequentFinalization: true,
        },
      },
      transcriber: 'automatic',
    }))
    await setup.dispose()
    channel.dispose()
  })

  it('carries live Float32 audio and ordered transcript events', async () => {
    const { channel, operations, provider, setup } = createConnectedProviders()
    const live = provider.transcription({ locale: 'en-US' }).startStream({
      inputSampleRate: 48_000,
    })
    const events = (async () => {
      const values = []
      for await (const value of live.fullStream)
        values.push(value)
      return values
    })()
    const writer = live.input.getWriter()

    await writer.write(new Float32Array([0.5]))
    await writer.close()

    await expect(live.done).resolves.toEqual({
      locale: 'en-US',
      text: 'remote final',
    })
    await expect(events).resolves.toMatchObject([
      { text: 'remote partial', type: 'transcript.text.partial' },
      { text: 'remote final', type: 'transcript.text.done' },
    ])
    expect(operations.start).toHaveBeenCalledOnce()
    await setup.dispose()
    channel.dispose()
  })

  it('observes input cancellation while native cleanup is still pending', async () => {
    const { channel, operations, provider, setup } = createConnectedProviders()
    let completeDisposal: (() => void) | undefined
    let reportDisposalStarted: (() => void) | undefined
    const disposalStarted = new Promise<void>((resolve) => {
      reportDisposalStarted = resolve
    })
    operations.start = vi.fn(async ({ locale }) => ({
      dispose: vi.fn(() => {
        reportDisposalStarted?.()
        return new Promise<void>((resolve) => {
          completeDisposal = resolve
        })
      }),
      finish: vi.fn(async () => ({ locale, text: '' })),
      write: vi.fn(async () => {}),
    }))
    const unhandledRejections: unknown[] = []
    /**
     * Records rejection events that escape the Eventa stream pump.
     *
     * Triggering workflow:
     *
     * `process.unhandledRejection`
     *   -> handleUnhandledRejection
     *     -> unhandledRejections
     *
     * Upstream:
     * - Node.js Promise rejection tracking
     *
     * Downstream:
     * - This regression assertion
     */
    const handleUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', handleUnhandledRejection)

    const live = provider.transcription({ locale: 'en-US' }).startStream({
      inputSampleRate: 48_000,
    })
    const writer = live.input.getWriter()
    let abort: Promise<void> | undefined
    try {
      await writer.write(new Float32Array([0.5]))
      abort = writer.abort(createAbortError('The renderer canceled live input.'))
      await disposalStarted
      await new Promise<void>(resolve => setImmediate(resolve))

      expect(unhandledRejections).toEqual([])
      completeDisposal?.()
      await abort
    }
    finally {
      process.off('unhandledRejection', handleUnhandledRejection)
      completeDisposal?.()
      await abort?.catch(() => {})
      await setup.dispose()
      channel.dispose()
    }
  })

  it('removes handlers before setup disposal completes', async () => {
    const { channel, mainContext, provider, setup } = createConnectedProviders()

    await setup.dispose()
    const disposeReplacement = defineInvokeHandler(
      mainContext,
      appleSpeechIsAvailable,
      () => ({
        available: false as const,
        reason: {
          code: 'framework-unavailable' as const,
          message: 'replacement handler',
        },
      }),
    )

    await expect(provider.isAvailable()).resolves.toMatchObject({
      available: false,
      reason: { message: 'replacement handler' },
    })
    disposeReplacement()
    channel.dispose()
  })
})
