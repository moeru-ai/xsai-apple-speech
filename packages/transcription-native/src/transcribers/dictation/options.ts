import type {
  AutomaticTranscriberOptions,
  DictationTranscriberOptions,
} from '@xsai-apple-speech/transcription'
import type { NativeDictationOptions, TranscriptionMode } from '../../types'

import { merge } from '@moeru/std'

const fileDefaults: NativeDictationOptions = {
  attributes: {
    audioTimeRange: false,
    transcriptionConfidence: false,
  },
  contentHints: {
    atypicalSpeech: false,
    farField: false,
    shortForm: false,
  },
  reporting: {
    alternativeTranscriptions: false,
    frequentFinalization: false,
    volatileResults: false,
  },
  transcription: {
    emoji: false,
    etiquetteReplacements: false,
    punctuation: true,
  },
}

const streamDefaults: NativeDictationOptions = {
  attributes: {
    audioTimeRange: true,
    transcriptionConfidence: false,
  },
  contentHints: {
    atypicalSpeech: false,
    farField: false,
    shortForm: false,
  },
  reporting: {
    alternativeTranscriptions: false,
    frequentFinalization: false,
    volatileResults: true,
  },
  transcription: {
    emoji: false,
    etiquetteReplacements: false,
    punctuation: true,
  },
}

/** Resolves public DictationTranscriber overrides against the selected input mode. */
export function parseOptions(
  mode: TranscriptionMode,
  options?: AutomaticTranscriberOptions | DictationTranscriberOptions,
): NativeDictationOptions {
  const weight = options?.contentHints?.customizedLanguage?.modelConfiguration.weight
  if (weight != null && (!Number.isFinite(weight) || weight < 0 || weight > 1))
    throw new RangeError('The custom language model weight must be from 0 through 1.')

  const languageModel
    = options
      ?.contentHints
      ?.customizedLanguage
      ?.modelConfiguration
      .languageModel
  if (languageModel != null && languageModel.trim() === '')
    throw new TypeError('The custom language model path must not be empty.')

  const defaults = mode === 'stream' ? streamDefaults : fileDefaults
  return merge(defaults, {
    attributes: merge(defaults.attributes, {
      ...(options?.attributes?.includeAudioTimeRange == null
        ? {}
        : { audioTimeRange: options.attributes.includeAudioTimeRange }),
      ...(options?.attributes?.includeTranscriptionConfidence == null
        ? {}
        : { transcriptionConfidence: options.attributes.includeTranscriptionConfidence }),
    }),
    contentHints: merge(defaults.contentHints, {
      ...(options?.contentHints?.atypicalSpeech == null
        ? {}
        : { atypicalSpeech: options.contentHints.atypicalSpeech }),
      ...(options?.contentHints?.customizedLanguage == null
        ? {}
        : { customizedLanguage: options.contentHints.customizedLanguage }),
      ...(options?.contentHints?.farField == null
        ? {}
        : { farField: options.contentHints.farField }),
      ...(options?.contentHints?.shortForm == null
        ? {}
        : { shortForm: options.contentHints.shortForm }),
    }),
    reporting: merge(defaults.reporting, {
      ...(options?.reporting?.includeAlternativeTranscriptions == null
        ? {}
        : { alternativeTranscriptions: options.reporting.includeAlternativeTranscriptions }),
      ...(options?.reporting?.preferFrequentFinalization == null
        ? {}
        : { frequentFinalization: options.reporting.preferFrequentFinalization }),
    }),
    transcription: merge(defaults.transcription, {
      ...(options?.transcription?.includeEmoji == null
        ? {}
        : { emoji: options.transcription.includeEmoji }),
      ...(options?.transcription?.applyEtiquetteReplacements == null
        ? {}
        : { etiquetteReplacements: options.transcription.applyEtiquetteReplacements }),
      ...(options?.transcription?.includePunctuation == null
        ? {}
        : { punctuation: options.transcription.includePunctuation }),
    }),
  })
}
