import type {
  AppleSpeechAnalysisContextOptions,
  AppleSpeechAvailability,
  AppleSpeechLoadProgress,
  AppleSpeechLocale,
  AppleSpeechRequestConfiguration,
  AppleSpeechTranscriber,
  AppleSpeechUnavailableReason,
  AutomaticTranscriberOptions,
  TranscriptionEvent,
  TranscriptionResult,
} from '@xsai-apple-speech/transcription'
import { defineInvokeEventa } from '@moeru/eventa'

export interface GenerateTranscriptionRequest extends AppleSpeechRequestConfiguration {
  audio: Uint8Array
  fileName?: string
  locale: string
  mediaType?: string
}

export type StreamInputFrame
  = | {
    channelCount: 1
    analysisContext?: AppleSpeechAnalysisContextOptions
    inputSampleRate: number
    locale: string
    options?: AutomaticTranscriberOptions
    sampleFormat: 'float32'
    transcriber: AppleSpeechTranscriber
    type: 'start'
  }
  | {
    samples: Float32Array
    type: 'audio'
  }

export interface AppleSpeechProtocolError {
  reason: AppleSpeechUnavailableReason
  type: 'apple-speech-unavailable'
}

export const appleSpeechIsAvailable = defineInvokeEventa<
  AppleSpeechAvailability,
  { transcriber: AppleSpeechTranscriber },
  AppleSpeechProtocolError
>('xsai-apple-speech:transcription:is-available')

export const appleSpeechGetLocales = defineInvokeEventa<
  AppleSpeechLocale[],
  { transcriber: AppleSpeechTranscriber },
  AppleSpeechProtocolError
>('xsai-apple-speech:transcription:get-locales')

export const appleSpeechLoad = defineInvokeEventa<
  AppleSpeechLoadProgress,
  { locale: string, transcriber: AppleSpeechTranscriber },
  AppleSpeechProtocolError
>('xsai-apple-speech:transcription:load')

export const appleSpeechGenerate = defineInvokeEventa<
  TranscriptionResult,
  GenerateTranscriptionRequest,
  AppleSpeechProtocolError
>('xsai-apple-speech:transcription:generate')

export const appleSpeechStream = defineInvokeEventa<
  TranscriptionEvent,
  StreamInputFrame,
  AppleSpeechProtocolError
>('xsai-apple-speech:transcription:stream')
