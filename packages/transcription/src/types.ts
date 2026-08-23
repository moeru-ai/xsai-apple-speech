import type { Fetch } from '@xsai/shared'

export type AppleSpeechUnavailableCode = 'framework-unavailable'

export interface AppleSpeechUnavailableReason {
  code: AppleSpeechUnavailableCode
  message: string
}

export type AppleSpeechAvailability
  = | { available: true }
    | { available: false, reason: AppleSpeechUnavailableReason }

export interface AppleSpeechLocale {
  installed: boolean
  locale: string
}

export type AppleSpeechTranscriber = 'automatic' | 'dictation' | 'speech'

/** Options that change the text from both Apple transcribers. */
export interface SharedTextOptions {
  /** Applies Apple's redactions for specified words and phrases. @default false */
  applyEtiquetteReplacements?: boolean
}

/** Options that change text from SpeechTranscriber. */
export type SpeechTextOptions = SharedTextOptions

/** Options that change text from DictationTranscriber. */
export interface DictationTextOptions extends SharedTextOptions {
  /** Transcribes spoken emoji names as emoji characters. @default false */
  includeEmoji?: boolean
  /** Adds punctuation to the transcription. @default true */
  includePunctuation?: boolean
}

/** Options that change result delivery from both Apple transcribers. */
export interface SharedReportingOptions {
  /** Adds alternative transcriptions to each native result. @default false */
  includeAlternativeTranscriptions?: boolean
}

/** Options that change result delivery from SpeechTranscriber. */
export interface SpeechReportingOptions extends SharedReportingOptions {
  /** Prefers faster results with lower accuracy. @default true for live audio; false for files */
  preferFastResults?: boolean
}

/** Options that change result delivery from DictationTranscriber. */
export interface DictationReportingOptions extends SharedReportingOptions {
  /** Prefers more frequent final results with lower accuracy. @default false */
  preferFrequentFinalization?: boolean
}

/** Optional attributes that both Apple transcribers attach to their text. */
export interface TranscriptionAttributeOptions {
  /** Adds time ranges to attributed transcription text. @default true for live audio; false for files */
  includeAudioTimeRange?: boolean
  /** Adds confidence values to attributed transcription text. @default false */
  includeTranscriptionConfidence?: boolean
}

/** A compiled custom language model for DictationTranscriber. */
export interface CustomizedLanguageOptions {
  modelConfiguration: {
    /** An absolute path to the compiled language model. */
    languageModel: string
    /** An optional absolute path to the compiled vocabulary. */
    vocabulary?: string
    /** The relative model weight from 0 through 1. */
    weight?: number
  }
}

/** Hints about audio content for DictationTranscriber. */
export interface DictationContentHintOptions {
  /** Uses a compiled custom language model. */
  customizedLanguage?: CustomizedLanguageOptions
  /** Optimizes audio from a speaker far from the microphone. @default false */
  farField?: boolean
  /** Optimizes audio that is approximately one minute long. @default false */
  shortForm?: boolean
  /** Optimizes audio for a heavy accent or another speech difference. @default false */
  atypicalSpeech?: boolean
}

/** Options for Apple's SpeechTranscriber. */
export interface SpeechTranscriberOptions {
  attributes?: TranscriptionAttributeOptions
  reporting?: SpeechReportingOptions
  transcription?: SpeechTextOptions
}

/** Options for Apple's DictationTranscriber. */
export interface DictationTranscriberOptions {
  attributes?: TranscriptionAttributeOptions
  contentHints?: DictationContentHintOptions
  reporting?: DictationReportingOptions
  transcription?: DictationTextOptions
}

/** Options that automatic selection can apply to either transcriber. */
export interface AutomaticTranscriberOptions {
  attributes?: TranscriptionAttributeOptions
  contentHints?: DictationContentHintOptions
  reporting?: SpeechReportingOptions & DictationReportingOptions
  transcription?: SpeechTextOptions & DictationTextOptions
}

/** Contextual input for the SpeechAnalyzer session. */
export interface AppleSpeechAnalysisContextOptions {
  contextualStrings?: {
    /** Words and phrases that Apple Speech must consider during recognition. */
    general?: string[]
  }
}

export interface GetAppleSpeechLocalesOptions {
  /** Selects the locale inventory. @default 'automatic' */
  transcriber?: AppleSpeechTranscriber
}

export type AppleSpeechLoadProgress
  = | {
    locale: string
    progress: number
    status: 'progress'
  }
  | {
    locale: string
    status: 'ready'
  }

export interface LoadAppleSpeechOptions {
  abortSignal?: AbortSignal
  locale: string
  onProgress?: (progress: AppleSpeechLoadProgress) => Promise<void> | void
  /** Selects the model asset to load. @default 'automatic' */
  transcriber?: AppleSpeechTranscriber
}

interface BaseAppleSpeechTranscriptionOptions {
  analysisContext?: AppleSpeechAnalysisContextOptions
  locale: string
}

interface AutomaticTranscriptionRequest extends BaseAppleSpeechTranscriptionOptions {
  options?: AutomaticTranscriberOptions
  /** Selects the best transcriber for the locale. @default 'automatic' */
  transcriber?: 'automatic'
}

interface SpeechTranscriptionRequest extends BaseAppleSpeechTranscriptionOptions {
  options?: SpeechTranscriberOptions
  transcriber: 'speech'
}

interface DictationTranscriptionRequest extends BaseAppleSpeechTranscriptionOptions {
  options?: DictationTranscriberOptions
  transcriber: 'dictation'
}

/** Options for one Provider transcription instance. */
export type AppleSpeechTranscriptionOptions
  = | AutomaticTranscriptionRequest
    | DictationTranscriptionRequest
    | SpeechTranscriptionRequest

/** Serializable configuration that Provider adapters pass to their runtime. */
export interface AppleSpeechRequestConfiguration {
  analysisContext?: AppleSpeechAnalysisContextOptions
  options?: AutomaticTranscriberOptions
  transcriber: AppleSpeechTranscriber
}

export interface TranscriptionResult {
  locale: string
  /** Native result chunks with optional Apple Speech metadata. */
  results?: TranscriptionResultDetail[]
  text: string
}

export interface AudioTimeRange {
  durationMilliseconds: number
  startMilliseconds: number
}

/** One attributed text run from an Apple Speech result. */
export interface TranscriptionTextAttribute {
  audioTimeRange?: AudioTimeRange
  text: string
  transcriptionConfidence?: number
}

/** One result chunk from the selected Apple transcriber. */
export interface TranscriptionResultDetail {
  alternatives?: string[]
  attributes?: TranscriptionTextAttribute[]
  range: TranscriptionRange
  text: string
}

export interface TranscriptionRange {
  durationMilliseconds: number
  isFinal: boolean
  startMilliseconds: number
}

export interface PartialTranscriptionEvent {
  locale: string
  range: TranscriptionRange
  /** The native result that changed this replacement transcript. */
  result?: TranscriptionResultDetail
  text: string
  type: 'transcript.text.partial'
}

export interface DoneTranscriptionEvent extends TranscriptionResult {
  type: 'transcript.text.done'
}

export type TranscriptionEvent = DoneTranscriptionEvent | PartialTranscriptionEvent

export interface StreamTranscriptionResult {
  dispose: () => Promise<void>
  done: Promise<TranscriptionResult>
  fullStream: ReadableStream<TranscriptionEvent>
  input: WritableStream<Float32Array>
  partialStream: ReadableStream<string>
  text: Promise<string>
}

export interface GenerateAppleSpeechRequest extends AppleSpeechRequestConfiguration {
  abortSignal: AbortSignal | undefined
  audio: Uint8Array
  fileName: string | undefined
  locale: string
  mediaType: string | undefined
}

export interface StartAppleSpeechRequest extends AppleSpeechRequestConfiguration {
  abortSignal: AbortSignal
  inputSampleRate: number
  locale: string
  onPartial: (event: PartialTranscriptionEvent) => Promise<void> | void
}

/**
 * One active low-level Transcription Session.
 *
 * The shared package owns its public Web Streams lifecycle. Provider packages
 * implement these three resource operations.
 */
export interface AppleSpeechSessionOperations {
  dispose: (reason?: unknown) => Promise<void>
  finish: () => Promise<TranscriptionResult>
  write: (samples: Float32Array) => Promise<void>
}

/**
 * Operations that connect the shared Provider to one implementation.
 *
 * Native and Electron packages implement this boundary. Application callers
 * use {@link AppleSpeechProvider} instead.
 */
export interface AppleSpeechProviderOperations {
  generate: (request: GenerateAppleSpeechRequest) => Promise<TranscriptionResult>
  getLocales: (transcriber: AppleSpeechTranscriber) => Promise<AppleSpeechLocale[]>
  isAvailable: (transcriber: AppleSpeechTranscriber) => Promise<AppleSpeechAvailability>
  load: (options: LoadAppleSpeechOptions & { transcriber: AppleSpeechTranscriber }) => Promise<void>
  start: (request: StartAppleSpeechRequest) => Promise<AppleSpeechSessionOperations>
}

export interface StartStreamTranscriptionOptions {
  abortSignal?: AbortSignal
  inputSampleRate: number
}

export interface AppleSpeechTranscription {
  baseURL: URL
  fetch: Fetch
  model: string
  /**
   * Starts the live path for {@link streamTranscription}.
   *
   * Callers normally pass this object to streamTranscription with object
   * spread syntax.
   */
  startStream: (options: StartStreamTranscriptionOptions) => StreamTranscriptionResult
}

export interface AppleSpeechProvider {
  getLocales: (options?: GetAppleSpeechLocalesOptions) => Promise<AppleSpeechLocale[]>
  isAvailable: (options?: GetAppleSpeechLocalesOptions) => Promise<AppleSpeechAvailability>
  load: (options: LoadAppleSpeechOptions) => Promise<void>
  transcription: (options: AppleSpeechTranscriptionOptions) => AppleSpeechTranscription
}

export interface StreamTranscriptionOptions extends AppleSpeechTranscription {
  abortSignal?: AbortSignal
  inputSampleRate: number
}
