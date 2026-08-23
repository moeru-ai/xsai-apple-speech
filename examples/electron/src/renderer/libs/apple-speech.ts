import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AppleSpeechAnalysisContextOptions,
  AppleSpeechRequestConfiguration,
  AppleSpeechTranscriber,
  AutomaticTranscriberOptions,
  TranscriptionEvent,
} from '@xsai-apple-speech/transcription'

import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { createAbortError, streamTranscription } from '@xsai-apple-speech/transcription'
import { createAppleSpeechProvider } from '@xsai-apple-speech/transcription-electron-plugin'

import transcriptionWorkletUrl from '../worklets/transcription.worklet?worker&url'

export interface TranscriptionOptionOverrides {
  applyEtiquetteReplacements?: boolean
  atypicalSpeech?: boolean
  farField?: boolean
  includeAlternativeTranscriptions?: boolean
  includeAudioTimeRange?: boolean
  includeEmoji?: boolean
  includePunctuation?: boolean
  includeTranscriptionConfidence?: boolean
  preferFastResults?: boolean
  preferFrequentFinalization?: boolean
  shortForm?: boolean
}

export interface SpeechRequestSettings {
  contextualStrings: string
  customLanguageModel: string
  customVocabulary: string
  customWeight: number | undefined
  overrides: TranscriptionOptionOverrides
  transcriber: AppleSpeechTranscriber
}

interface AudioFrameWriter {
  abort: (reason?: unknown) => Promise<void>
  close: () => Promise<void>
  write: (samples: Float32Array) => Promise<void>
}

function hasElectronApi(value: Window): value is Window & { electron: ElectronAPI } {
  return 'electron' in value
}

if (!hasElectronApi(window))
  throw new Error('The Electron preload API is not available.')

const eventa = createContext(window.electron.ipcRenderer)

export const appleSpeechProvider = createAppleSpeechProvider({ context: eventa.context })

window.addEventListener('beforeunload', () => {
  eventa.dispose()
}, { once: true })

function compact<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined
}

function contextualStrings(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map(item => item.trim())
    .filter(Boolean)
}

/** Builds the serializable Provider configuration from the playground fields. */
export function createSpeechRequestConfiguration(
  settings: SpeechRequestSettings,
): AppleSpeechRequestConfiguration {
  const { overrides } = settings
  const transcription = compact({
    ...(overrides.applyEtiquetteReplacements == null ? {} : { applyEtiquetteReplacements: overrides.applyEtiquetteReplacements }),
    ...(overrides.includeEmoji == null ? {} : { includeEmoji: overrides.includeEmoji }),
    ...(overrides.includePunctuation == null ? {} : { includePunctuation: overrides.includePunctuation }),
  })
  const reporting = compact({
    ...(overrides.includeAlternativeTranscriptions == null ? {} : { includeAlternativeTranscriptions: overrides.includeAlternativeTranscriptions }),
    ...(overrides.preferFastResults == null ? {} : { preferFastResults: overrides.preferFastResults }),
    ...(overrides.preferFrequentFinalization == null ? {} : { preferFrequentFinalization: overrides.preferFrequentFinalization }),
  })
  const attributes = compact({
    ...(overrides.includeAudioTimeRange == null ? {} : { includeAudioTimeRange: overrides.includeAudioTimeRange }),
    ...(overrides.includeTranscriptionConfidence == null ? {} : { includeTranscriptionConfidence: overrides.includeTranscriptionConfidence }),
  })
  const languageModel = settings.customLanguageModel.trim()
  const vocabulary = settings.customVocabulary.trim()
  const contentHints = compact({
    ...(overrides.atypicalSpeech == null ? {} : { atypicalSpeech: overrides.atypicalSpeech }),
    ...(overrides.farField == null ? {} : { farField: overrides.farField }),
    ...(overrides.shortForm == null ? {} : { shortForm: overrides.shortForm }),
    ...(languageModel
      ? {
          customizedLanguage: {
            modelConfiguration: {
              languageModel,
              ...(vocabulary ? { vocabulary } : {}),
              ...(settings.customWeight == null ? {} : { weight: settings.customWeight }),
            },
          },
        }
      : {}),
  })
  const options = compact<AutomaticTranscriberOptions>({
    ...(attributes ? { attributes } : {}),
    ...(contentHints ? { contentHints } : {}),
    ...(reporting ? { reporting } : {}),
    ...(transcription ? { transcription } : {}),
  })
  const general = contextualStrings(settings.contextualStrings)
  const analysisContext: AppleSpeechAnalysisContextOptions | undefined = general.length > 0
    ? { contextualStrings: { general } }
    : undefined

  return {
    ...(analysisContext ? { analysisContext } : {}),
    ...(options ? { options } : {}),
    transcriber: settings.transcriber,
  }
}

function createAudioFrameQueue(
  writer: AudioFrameWriter,
  onError: (error: unknown) => void,
): {
  abort: (reason?: unknown) => Promise<void>
  close: () => Promise<void>
  push: (samples: Float32Array) => void
} {
  let pending = Promise.resolve()
  let failure: unknown
  let closed = false

  const reportFailure = (error: unknown): never => {
    if (failure === undefined) {
      failure = error
      onError(error)
    }
    throw error
  }

  return {
    async abort(reason) {
      if (closed)
        return pending.catch(() => {})
      closed = true
      try {
        await pending
      }
      catch {
        return
      }
      await writer.abort(reason)
    },
    async close() {
      if (closed)
        return pending
      closed = true
      await pending
      await writer.close()
    },
    push(samples) {
      if (closed || failure !== undefined)
        return
      for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index] ?? 0
        samples[index] = Number.isFinite(sample)
          ? Math.max(-1, Math.min(1, sample))
          : 0
      }
      pending = pending
        .then(() => writer.write(samples))
        .catch(reportFailure)
    },
  }
}

export interface MicrophoneTranscriptionCallbacks {
  onError: (error: unknown) => void
  onEvent: (event: TranscriptionEvent) => void
}

export interface StartMicrophoneTranscriptionOptions extends MicrophoneTranscriptionCallbacks {
  configuration: AppleSpeechRequestConfiguration
  locale: string
}

export interface MicrophoneTranscription {
  cancel: () => Promise<void>
  sampleRate: number
  startedAt: number
  stop: () => Promise<void>
}

async function readValues<T>(
  stream: ReadableStream<T>,
  onValue: (value: T) => void,
): Promise<void> {
  for await (const value of stream)
    onValue(value)
}

/** Starts microphone capture and connects its mono PCM frames to one session. */
export async function startMicrophoneTranscription(
  options: StartMicrophoneTranscriptionOptions,
): Promise<MicrophoneTranscription> {
  const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const audioContext = new AudioContext()

  try {
    await audioContext.audioWorklet.addModule(transcriptionWorkletUrl)
    const source = audioContext.createMediaStreamSource(mediaStream)
    const worklet = new AudioWorkletNode(audioContext, 'transcription-processor')
    const session = streamTranscription({
      ...appleSpeechProvider.transcription({
        ...options.configuration,
        locale: options.locale,
      }),
      inputSampleRate: audioContext.sampleRate,
    })
    const writer = session.input.getWriter()
    const queue = createAudioFrameQueue(writer, options.onError)
    let settled = false

    const handleAudioFrame = (event: MessageEvent<Float32Array>) => {
      queue.push(event.data)
    }
    worklet.port.onmessage = handleAudioFrame
    const startedAt = performance.now()
    source.connect(worklet)
    // A silent destination connection keeps the worklet active without
    // feeding microphone audio back to the speakers.
    const gain = audioContext.createGain()
    gain.gain.value = 0
    worklet.connect(gain).connect(audioContext.destination)

    const eventReader = readValues(session.fullStream, options.onEvent)
    void eventReader.catch(options.onError)

    const releaseCapture = async () => {
      worklet.port.onmessage = null
      source.disconnect()
      worklet.disconnect()
      gain.disconnect()
      for (const track of mediaStream.getTracks())
        track.stop()
      await audioContext.close()
    }

    return {
      async cancel() {
        if (settled)
          return
        settled = true
        await releaseCapture()
        await queue.abort(createAbortError('Microphone transcription was canceled.'))
        await Promise.allSettled([eventReader])
      },
      sampleRate: audioContext.sampleRate,
      startedAt,
      async stop() {
        if (settled)
          return
        settled = true
        await releaseCapture()
        await queue.close()
        await session.done
        await eventReader
      },
    }
  }
  catch (error) {
    for (const track of mediaStream.getTracks())
      track.stop()
    await audioContext.close()
    throw error
  }
}
