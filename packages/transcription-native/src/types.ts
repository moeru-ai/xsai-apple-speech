import type {
  AppleSpeechAnalysisContextOptions,
  AppleSpeechLoadProgress,
  AppleSpeechLocale,
  AppleSpeechTranscriber,
  PartialTranscriptionEvent,
  TranscriptionResult,
} from '@xsai-apple-speech/transcription'

export type TranscriptionMode = 'file' | 'stream'

export interface NativeAttributeOptions {
  audioTimeRange: boolean
  transcriptionConfidence: boolean
}

export interface NativeSpeechOptions {
  attributes: NativeAttributeOptions
  reporting: {
    alternativeTranscriptions: boolean
    fastResults: boolean
    volatileResults: boolean
  }
  transcription: {
    etiquetteReplacements: boolean
  }
}

export interface NativeDictationOptions {
  attributes: NativeAttributeOptions
  contentHints: {
    atypicalSpeech: boolean
    customizedLanguage?: {
      modelConfiguration: {
        languageModel: string
        vocabulary?: string
        weight?: number
      }
    }
    farField: boolean
    shortForm: boolean
  }
  reporting: {
    alternativeTranscriptions: boolean
    frequentFinalization: boolean
    volatileResults: boolean
  }
  transcription: {
    emoji: boolean
    etiquetteReplacements: boolean
    punctuation: boolean
  }
}

/** The complete JSON configuration consumed by AppleSpeechBridge. */
export interface NativeTranscriptionConfiguration {
  analysisContext?: AppleSpeechAnalysisContextOptions
  dictation?: NativeDictationOptions
  speech?: NativeSpeechOptions
  transcriber: AppleSpeechTranscriber
}

export interface RawNativeAddon {
  cancelLoad: (operationId: string) => Promise<void>
  cancelOperation: (operationId: string) => Promise<void>
  cancelStream: (sessionId: string) => Promise<void>
  finishStream: (sessionId: string) => Promise<string>
  generate: (
    operationId: string,
    audio: Uint8Array,
    locale: string,
    configurationJson: string,
    fileName: string | undefined,
    mediaType: string | undefined,
  ) => Promise<string>
  getLocales: (transcriber: AppleSpeechTranscriber) => Promise<string>
  isAvailable: (transcriber: AppleSpeechTranscriber) => Promise<string>
  load: (
    operationId: string,
    locale: string,
    transcriber: AppleSpeechTranscriber,
    onProgress: (progressJson: string) => void,
  ) => Promise<void>
  startStream: (
    sessionId: string,
    locale: string,
    inputSampleRate: number,
    configurationJson: string,
    onPartial: (eventJson: string) => void,
  ) => Promise<void>
  writeStream: (sessionId: string, samples: Float32Array) => Promise<void>
}

export interface NativeBinding {
  cancelLoad: RawNativeAddon['cancelLoad']
  cancelOperation: RawNativeAddon['cancelOperation']
  cancelStream: RawNativeAddon['cancelStream']
  finishStream: (sessionId: string) => Promise<TranscriptionResult>
  generate: (
    operationId: string,
    audio: Uint8Array,
    locale: string,
    configuration: NativeTranscriptionConfiguration,
    fileName: string | undefined,
    mediaType: string | undefined,
  ) => Promise<TranscriptionResult>
  getLocales: (transcriber: AppleSpeechTranscriber) => Promise<AppleSpeechLocale[]>
  isAvailable: (transcriber: AppleSpeechTranscriber) => Promise<boolean>
  load: (
    operationId: string,
    locale: string,
    transcriber: AppleSpeechTranscriber,
    onProgress: (progress: AppleSpeechLoadProgress) => void,
  ) => Promise<void>
  startStream: (
    sessionId: string,
    locale: string,
    inputSampleRate: number,
    configuration: NativeTranscriptionConfiguration,
    onPartial: (event: PartialTranscriptionEvent) => void,
  ) => Promise<void>
  writeStream: RawNativeAddon['writeStream']
}
