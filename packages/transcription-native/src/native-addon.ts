import type {
  AppleSpeechLoadProgress,
  AppleSpeechLocale,
  PartialTranscriptionEvent,
  TranscriptionResult,
} from '@xsai-apple-speech/transcription'

import type { NativeBinding, RawNativeAddon } from './types'

function parseJson<T>(json: string): T {
  return JSON.parse(json) as T
}

export function createNativeBinding(addon: RawNativeAddon): NativeBinding {
  return {
    cancelLoad: operationId => addon.cancelLoad(operationId),
    cancelOperation: operationId => addon.cancelOperation(operationId),
    cancelStream: sessionId => addon.cancelStream(sessionId),
    finishStream: async sessionId =>
      parseJson<TranscriptionResult>(await addon.finishStream(sessionId)),
    generate: async (operationId, audio, locale, configuration, fileName, mediaType) =>
      parseJson<TranscriptionResult>(
        await addon.generate(
          operationId,
          audio,
          locale,
          JSON.stringify(configuration),
          fileName,
          mediaType,
        ),
      ),
    getLocales: async transcriber =>
      parseJson<AppleSpeechLocale[]>(await addon.getLocales(transcriber)),
    isAvailable: async transcriber =>
      parseJson<boolean>(await addon.isAvailable(transcriber)),
    load: (operationId, locale, transcriber, onProgress) =>
      addon.load(operationId, locale, transcriber, value =>
        onProgress(parseJson<AppleSpeechLoadProgress>(value))),
    startStream: (sessionId, locale, inputSampleRate, configuration, onPartial) =>
      addon.startStream(
        sessionId,
        locale,
        inputSampleRate,
        JSON.stringify(configuration),
        value => onPartial(parseJson<PartialTranscriptionEvent>(value)),
      ),
    writeStream: (sessionId, samples) => addon.writeStream(sessionId, samples),
  }
}
