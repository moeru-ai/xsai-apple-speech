import type { RawNativeAddon } from './index'

import { describe, expect, it, vi } from 'vitest'
import {
  createAbortError,
  createAppleSpeechProvider,
  streamTranscription,
} from './index'

function createRawAddon(overrides: Partial<RawNativeAddon> = {}): RawNativeAddon {
  return {
    cancelLoad: vi.fn(async () => {}),
    cancelOperation: vi.fn(async () => {}),
    cancelStream: vi.fn(async () => {}),
    finishStream: vi.fn(async () => JSON.stringify({ locale: 'en-US', text: 'done' })),
    generate: vi.fn(async () => JSON.stringify({ locale: 'en-US', text: 'batch' })),
    getLocales: vi.fn(async () => JSON.stringify([
      { installed: false, locale: 'en-US' },
    ])),
    isAvailable: vi.fn(async () => 'true'),
    load: vi.fn(async (_operationId, locale, _transcriber, onProgress) => {
      onProgress(JSON.stringify({ locale, progress: 25, status: 'progress' }))
    }),
    startStream: vi.fn(async () => {}),
    writeStream: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('native addon', () => {
  it('does not call the native addon before isAvailable is called', async () => {
    const addon = createRawAddon()
    const provider = createAppleSpeechProvider({ addon })

    expect(addon.isAvailable).not.toHaveBeenCalled()
    await expect(provider.isAvailable()).resolves.toEqual({ available: true })
    expect(addon.isAvailable).toHaveBeenCalledOnce()
  })
})

describe('native locale loading', () => {
  it('reports ordered progress and a final ready value', async () => {
    const addon = createRawAddon()
    const provider = createAppleSpeechProvider({ addon })
    const progress: string[] = []

    await provider.load({
      locale: 'en-US',
      async onProgress(value) {
        await Promise.resolve()
        progress.push(value.status)
      },
    })

    expect(addon.load).toHaveBeenCalledOnce()
    expect(progress).toEqual(['progress', 'ready'])
  })

  it('starts an independent native operation for each load', async () => {
    const addon = createRawAddon()
    const provider = createAppleSpeechProvider({ addon })

    await Promise.all([
      provider.load({ locale: 'en-US' }),
      provider.load({ locale: 'en-US' }),
    ])

    expect(addon.load).toHaveBeenCalledTimes(2)
    const firstOperationId = vi.mocked(addon.load).mock.calls[0]?.[0]
    const secondOperationId = vi.mocked(addon.load).mock.calls[1]?.[0]
    expect(firstOperationId).not.toBe(secondOperationId)
  })

  it('cancels a native locale load', async () => {
    const controller = new AbortController()
    const reason = createAbortError('Canceled while joining.')
    const addon = createRawAddon({
      load: vi.fn(() => {
        controller.abort(reason)
        return new Promise<void>(() => {})
      }),
    })
    const provider = createAppleSpeechProvider({ addon })

    await expect(provider.load({
      abortSignal: controller.signal,
      locale: 'en-US',
    })).rejects.toBe(reason)
    await vi.waitFor(() => expect(addon.cancelLoad).toHaveBeenCalledOnce())
  })

  it('does not share model loads between transcribers', async () => {
    const addon = createRawAddon()
    const provider = createAppleSpeechProvider({ addon })

    await provider.load({ locale: 'en-US', transcriber: 'speech' })
    await provider.load({ locale: 'en-US', transcriber: 'dictation' })

    expect(addon.load).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      'en-US',
      'speech',
      expect.any(Function),
    )
    expect(addon.load).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      'en-US',
      'dictation',
      expect.any(Function),
    )
  })
})

describe('native operation cancellation', () => {
  it('cancels native batch work when abort occurs as the operation starts', async () => {
    const controller = new AbortController()
    const reason = createAbortError('Canceled during native startup.')
    const addon = createRawAddon({
      generate: vi.fn(() => {
        controller.abort(reason)
        return new Promise<string>(() => {})
      }),
    })
    const provider = createAppleSpeechProvider({ addon })

    const transcription = provider.transcription({ locale: 'en-US' })
    const body = new FormData()
    body.append('file', new Blob(['audio'], { type: 'audio/wav' }), 'sample.wav')

    await expect(transcription.fetch(transcription.baseURL, {
      body,
      method: 'POST',
      signal: controller.signal,
    })).rejects.toBe(reason)
    expect(addon.cancelOperation).toHaveBeenCalledOnce()
  })

  it('waits for native cleanup when the operation rejects during cancellation', async () => {
    const controller = new AbortController()
    const reason = createAbortError('Canceled during native startup.')
    let completeCancellation: (() => void) | undefined
    const addon = createRawAddon({
      cancelOperation: vi.fn(() => new Promise<void>((resolve) => {
        completeCancellation = resolve
      })),
      generate: vi.fn(() => {
        controller.abort(reason)
        return Promise.reject(reason)
      }),
    })
    const provider = createAppleSpeechProvider({ addon })
    const transcription = provider.transcription({ locale: 'en-US' })
    const body = new FormData()
    body.append('file', new Blob(['audio'], { type: 'audio/wav' }), 'sample.wav')
    const result = transcription.fetch(transcription.baseURL, {
      body,
      method: 'POST',
      signal: controller.signal,
    })
    let settled = false
    void result.finally(() => {
      settled = true
    }).catch(() => {})

    await vi.waitFor(() => expect(addon.cancelOperation).toHaveBeenCalledOnce())
    await Promise.resolve()
    expect(settled).toBe(false)
    completeCancellation?.()

    await expect(result).rejects.toBe(reason)
  })
})

describe('native transcriber options', () => {
  it('resolves both automatic configurations for file transcription', async () => {
    const addon = createRawAddon()
    const provider = createAppleSpeechProvider({ addon })
    const transcription = provider.transcription({
      analysisContext: {
        contextualStrings: {
          general: ['xsAI'],
        },
      },
      locale: 'en-US',
      options: {
        attributes: {
          includeTranscriptionConfidence: true,
        },
        contentHints: {
          farField: true,
        },
        reporting: {
          includeAlternativeTranscriptions: true,
          preferFastResults: true,
          preferFrequentFinalization: true,
        },
        transcription: {
          applyEtiquetteReplacements: true,
          includeEmoji: true,
          includePunctuation: false,
        },
      },
    })
    const body = new FormData()
    body.append('file', new Blob(['audio'], { type: 'audio/wav' }), 'sample.wav')

    await transcription.fetch(transcription.baseURL, { body, method: 'POST' })

    expect(addon.generate).toHaveBeenCalledOnce()
    const configurationJson = vi.mocked(addon.generate).mock.calls[0]?.[3]
    expect(JSON.parse(configurationJson ?? '{}')).toEqual({
      analysisContext: {
        contextualStrings: {
          general: ['xsAI'],
        },
      },
      dictation: {
        attributes: {
          audioTimeRange: false,
          transcriptionConfidence: true,
        },
        contentHints: {
          atypicalSpeech: false,
          farField: true,
          shortForm: false,
        },
        reporting: {
          alternativeTranscriptions: true,
          frequentFinalization: true,
          volatileResults: false,
        },
        transcription: {
          emoji: true,
          etiquetteReplacements: true,
          punctuation: false,
        },
      },
      speech: {
        attributes: {
          audioTimeRange: false,
          transcriptionConfidence: true,
        },
        reporting: {
          alternativeTranscriptions: true,
          fastResults: true,
          volatileResults: false,
        },
        transcription: {
          etiquetteReplacements: true,
        },
      },
      transcriber: 'automatic',
    })
  })

  it('uses live defaults and omits the unselected transcriber', async () => {
    const addon = createRawAddon()
    const provider = createAppleSpeechProvider({ addon })
    const live = streamTranscription({
      ...provider.transcription({
        locale: 'en-US',
        transcriber: 'speech',
      }),
      inputSampleRate: 16_000,
    })

    await live.input.getWriter().close()
    await live.done

    expect(addon.startStream).toHaveBeenCalledOnce()
    const configurationJson = vi.mocked(addon.startStream).mock.calls[0]?.[3]
    expect(JSON.parse(configurationJson ?? '{}')).toEqual({
      speech: {
        attributes: {
          audioTimeRange: true,
          transcriptionConfidence: false,
        },
        reporting: {
          alternativeTranscriptions: false,
          fastResults: true,
          volatileResults: true,
        },
        transcription: {
          etiquetteReplacements: false,
        },
      },
      transcriber: 'speech',
    })
  })

  it('rejects an invalid custom language model weight', async () => {
    const provider = createAppleSpeechProvider({ addon: createRawAddon() })
    const transcription = provider.transcription({
      locale: 'en-US',
      options: {
        contentHints: {
          customizedLanguage: {
            modelConfiguration: {
              languageModel: new URL('model.bin', import.meta.url).pathname,
              weight: 1.5,
            },
          },
        },
      },
    })
    const body = new FormData()
    body.append('file', new Blob(['audio']), 'sample.wav')

    await expect(transcription.fetch(transcription.baseURL, {
      body,
      method: 'POST',
    })).rejects.toThrow('weight must be from 0 through 1')
  })

  it('rejects more than 100 contextual strings', async () => {
    const provider = createAppleSpeechProvider({ addon: createRawAddon() })
    const transcription = provider.transcription({
      analysisContext: {
        contextualStrings: {
          general: Array.from({ length: 101 }, (_, index) => `word-${index}`),
        },
      },
      locale: 'en-US',
    })
    const body = new FormData()
    body.append('file', new Blob(['audio']), 'sample.wav')

    await expect(transcription.fetch(transcription.baseURL, {
      body,
      method: 'POST',
    })).rejects.toThrow('at most 100 contextual strings')
  })
})
