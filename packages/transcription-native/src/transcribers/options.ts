import type { AppleSpeechRequestConfiguration } from '@xsai-apple-speech/transcription'
import type {
  NativeTranscriptionConfiguration,
  TranscriptionMode,
} from '../types'

import { parseOptions as parseDictationOptions } from './dictation/options'
import { parseOptions as parseSpeechOptions } from './speech/options'

/**
 * Parses public options into the native transcription configuration.
 *
 * @example
 * parseOptions({ transcriber: 'speech' }, 'file')
 * // => { speech: { ... }, transcriber: 'speech' }
 */
export function parseOptions(
  request: AppleSpeechRequestConfiguration,
  mode: TranscriptionMode,
): NativeTranscriptionConfiguration {
  const general = request.analysisContext?.contextualStrings?.general
  if (general != null && general.length > 100)
    throw new RangeError('Apple Speech accepts at most 100 contextual strings.')

  return {
    ...(request.analysisContext == null
      ? {}
      : { analysisContext: request.analysisContext }),
    ...(request.transcriber === 'dictation'
      ? {}
      : { speech: parseSpeechOptions(mode, request.options) }),
    ...(request.transcriber === 'speech'
      ? {}
      : { dictation: parseDictationOptions(mode, request.options) }),
    transcriber: request.transcriber,
  }
}
