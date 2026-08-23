import type {
  AutomaticTranscriberOptions,
  SpeechTranscriberOptions,
} from '@xsai-apple-speech/transcription'
import type { NativeSpeechOptions, TranscriptionMode } from '../../types'

import { merge } from '@moeru/std'

const fileDefaults: NativeSpeechOptions = {
  attributes: {
    audioTimeRange: false,
    transcriptionConfidence: false,
  },
  reporting: {
    alternativeTranscriptions: false,
    fastResults: false,
    volatileResults: false,
  },
  transcription: {
    etiquetteReplacements: false,
  },
}

const streamDefaults: NativeSpeechOptions = {
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
}

/** Resolves public SpeechTranscriber overrides against the selected input mode. */
export function parseOptions(
  mode: TranscriptionMode,
  options?: AutomaticTranscriberOptions | SpeechTranscriberOptions,
): NativeSpeechOptions {
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
    reporting: merge(defaults.reporting, {
      ...(options?.reporting?.includeAlternativeTranscriptions == null
        ? {}
        : { alternativeTranscriptions: options.reporting.includeAlternativeTranscriptions }),
      ...(options?.reporting?.preferFastResults == null
        ? {}
        : { fastResults: options.reporting.preferFastResults }),
    }),
    transcription: merge(defaults.transcription, {
      ...(options?.transcription?.applyEtiquetteReplacements == null
        ? {}
        : { etiquetteReplacements: options.transcription.applyEtiquetteReplacements }),
    }),
  })
}
