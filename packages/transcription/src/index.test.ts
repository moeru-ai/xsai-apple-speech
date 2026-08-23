import type {
  AppleSpeechLocaleError,
  AppleSpeechProviderOperations,
  TranscriptionEvent,
} from './index'

import { generateTranscription } from '@xsai/generate-transcription'
import { describe, expect, it, vi } from 'vitest'

import {

  createAbortError,
  createAppleSpeechProvider,
  streamTranscription,

} from './index'

function createOperations(
  overrides: Partial<AppleSpeechProviderOperations> = {},
): AppleSpeechProviderOperations {
  return {
    generate: vi.fn(async ({ locale }) => ({ locale, text: 'batch result' })),
    getLocales: vi.fn(async () => [{ installed: true, locale: 'en-US' }]),
    isAvailable: vi.fn(async () => ({ available: true as const })),
    load: vi.fn(async ({ locale, onProgress }) => {
      await onProgress?.({ locale, status: 'ready' })
    }),
    start: vi.fn(async ({ locale, onPartial }) => ({
      dispose: vi.fn(async () => {}),
      finish: vi.fn(async () => ({ locale, text: 'final transcript' })),
      write: vi.fn(async () => {
        await onPartial({
          locale,
          range: {
            durationMilliseconds: 250,
            isFinal: false,
            startMilliseconds: 0,
          },
          text: 'current transcript',
          type: 'transcript.text.partial',
        })
      }),
    })),
    ...overrides,
  }
}

describe('apple Speech Provider', () => {
  it('creates a serializable Error for cancellation', () => {
    const error = createAbortError('Canceled across a process boundary.')
    const cloned = structuredClone(error)

    expect(error).toBeInstanceOf(Error)
    expect(error.constructor).toBe(Error)
    expect(error).toMatchObject({
      message: 'Canceled across a process boundary.',
      name: 'AbortError',
    })
    expect(cloned).toBeInstanceOf(Error)
    expect(cloned.message).toBe('Canceled across a process boundary.')
    expect(String(cloned)).not.toContain('[object Object]')
  })

  it('projects encoded audio through xsAI generateTranscription', async () => {
    const operations = createOperations()
    const provider = createAppleSpeechProvider(operations)

    const result = await generateTranscription({
      ...provider.transcription({ locale: 'en-us' }),
      file: new Blob(['audio'], { type: 'audio/wav' }),
      fileName: 'sample.wav',
    })

    expect(result.text).toBe('batch result')
    expect(operations.generate).toHaveBeenCalledWith({
      abortSignal: undefined,
      audio: new Uint8Array([97, 117, 100, 105, 111]),
      fileName: 'sample.wav',
      locale: 'en-US',
      mediaType: 'audio/wav',
      transcriber: 'automatic',
    })
    expect(operations.getLocales).toHaveBeenCalledWith('automatic')
  })

  it('passes automatic overrides to batch and live operations', async () => {
    const operations = createOperations()
    const provider = createAppleSpeechProvider(operations)
    const transcription = provider.transcription({
      analysisContext: {
        contextualStrings: {
          general: ['xsAI', 'AIRI'],
        },
      },
      locale: 'en-US',
      options: {
        contentHints: {
          farField: true,
        },
        reporting: {
          preferFastResults: false,
          preferFrequentFinalization: true,
        },
        transcription: {
          includeEmoji: true,
          includePunctuation: true,
        },
      },
    })

    await generateTranscription({
      ...transcription,
      file: new Blob(['audio'], { type: 'audio/wav' }),
    })
    const live = streamTranscription({
      ...transcription,
      inputSampleRate: 16_000,
    })
    await live.input.getWriter().close()
    await live.done

    const configuration = {
      analysisContext: {
        contextualStrings: {
          general: ['xsAI', 'AIRI'],
        },
      },
      options: {
        contentHints: {
          farField: true,
        },
        reporting: {
          preferFastResults: false,
          preferFrequentFinalization: true,
        },
        transcription: {
          includeEmoji: true,
          includePunctuation: true,
        },
      },
      transcriber: 'automatic',
    } as const
    expect(operations.generate).toHaveBeenCalledWith(expect.objectContaining(configuration))
    expect(operations.start).toHaveBeenCalledWith(expect.objectContaining(configuration))
  })

  it('rejects a locale that is not an exact supported match', async () => {
    const provider = createAppleSpeechProvider(createOperations())

    await expect(provider.load({ locale: 'en' })).rejects.toMatchObject({
      name: 'AppleSpeechLocaleError',
      requestedLocale: 'en',
      supportedLocales: ['en-US'],
    } satisfies Partial<AppleSpeechLocaleError>)
  })

  it('publishes replaceable partial text and one done event', async () => {
    const provider = createAppleSpeechProvider(createOperations())
    const live = streamTranscription({
      ...provider.transcription({ locale: 'en-US' }),
      inputSampleRate: 48_000,
    })
    const partialValues: string[] = []
    const events: TranscriptionEvent[] = []
    const partialReader = live.partialStream.getReader()
    const fullReader = live.fullStream.getReader()

    const writer = live.input.getWriter()
    await writer.write(new Float32Array([0.25, -0.25]))
    await writer.close()

    for (;;) {
      const next = await partialReader.read()
      if (next.done)
        break
      partialValues.push(next.value)
    }
    for (;;) {
      const next = await fullReader.read()
      if (next.done)
        break
      events.push(next.value)
    }

    await expect(live.text).resolves.toBe('final transcript')
    await expect(live.done).resolves.toEqual({ locale: 'en-US', text: 'final transcript' })
    expect(partialValues).toEqual(['current transcript'])
    expect(events.map(event => event.type)).toEqual([
      'transcript.text.partial',
      'transcript.text.done',
    ])
  })

  it('disposes a session that finishes startup after cancellation', async () => {
    let resolveStart: ((session: Awaited<ReturnType<AppleSpeechProviderOperations['start']>>) => void) | undefined
    const lateSession = {
      dispose: vi.fn(async () => {}),
      finish: vi.fn(async () => ({ locale: 'en-US', text: '' })),
      write: vi.fn(async () => {}),
    }
    const operations = createOperations({
      start: vi.fn(() => new Promise<Awaited<ReturnType<AppleSpeechProviderOperations['start']>>>((resolve) => {
        resolveStart = resolve
      })),
    })
    const live = streamTranscription({
      ...createAppleSpeechProvider(operations).transcription({ locale: 'en-US' }),
      inputSampleRate: 16_000,
    })

    await vi.waitFor(() => {
      expect(operations.start).toHaveBeenCalledOnce()
    })
    const disposal = live.dispose()
    resolveStart?.(lateSession)
    await disposal

    expect(lateSession.dispose).toHaveBeenCalledOnce()
    await expect(live.done).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('propagates a writable abort reason after cleanup', async () => {
    const reason = new Error('capture stopped')
    const dispose = vi.fn(async () => {})
    const provider = createAppleSpeechProvider(createOperations({
      start: vi.fn(async () => ({
        dispose,
        finish: vi.fn(async () => ({ locale: 'en-US', text: '' })),
        write: vi.fn(async () => {}),
      })),
    }))
    const live = streamTranscription({
      ...provider.transcription({ locale: 'en-US' }),
      inputSampleRate: 16_000,
    })
    const writer = live.input.getWriter()

    await writer.write(new Float32Array())
    await writer.abort(reason)

    expect(dispose).toHaveBeenCalledWith(reason)
    await expect(live.text).rejects.toBe(reason)
    await expect(live.done).rejects.toBe(reason)
  })

  it('does not dispose a failed session twice', async () => {
    const failure = new Error('native write failed')
    const dispose = vi.fn(async () => {})
    const provider = createAppleSpeechProvider(createOperations({
      start: vi.fn(async () => ({
        dispose,
        finish: vi.fn(async () => ({ locale: 'en-US', text: '' })),
        write: vi.fn(async () => {
          throw failure
        }),
      })),
    }))
    const live = streamTranscription({
      ...provider.transcription({ locale: 'en-US' }),
      inputSampleRate: 16_000,
    })
    const writer = live.input.getWriter()

    await expect(writer.write(new Float32Array())).rejects.toBe(failure)
    await live.dispose()

    expect(dispose).toHaveBeenCalledOnce()
    await expect(live.done).rejects.toBe(failure)
  })
})
