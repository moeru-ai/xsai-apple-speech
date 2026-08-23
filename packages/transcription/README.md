# `@xsai-apple-speech/transcription`

This package owns the platform-neutral Apple Speech Provider contract, xsAI batch adapter, locale rules, structured errors, and live Web Streams lifecycle.

Use it when you consume a Provider or implement a new native or remote transport. Use `@xsai-apple-speech/transcription-native` for direct macOS execution. Use `@xsai-apple-speech/transcription-electron-plugin` in a renderer.

```ts
import { streamTranscription } from '@xsai-apple-speech/transcription'

const session = streamTranscription({
  ...provider.transcription({ locale: 'zh-CN' }),
  inputSampleRate: 48_000,
})
```

`partialStream` yields replacement text for the current partial result. `fullStream` yields ordered partial events and one final `transcript.text.done` event. `done` and `text` settle only after the implementation releases its session resources.

The `transcriber` option defaults to `automatic`. Automatic mode prefers `SpeechTranscriber` and falls back to `DictationTranscriber` for an unsupported locale.

The `options` object groups text, reporting, attribute, and content-hint overrides. Automatic mode accepts the union of both transcriber option sets.

```ts
const transcription = provider.transcription({
  locale: 'en-US',
  options: {
    transcription: {
      includePunctuation: true,
    },
  },
})
```

Native result chunks are available in `TranscriptionResult.results`. A partial event exposes its changed native chunk through `result`.

Apple Speech adds alternatives and attributed metadata only when their options are enabled. The main `text` field stays compatible with xsAI transcription calls.

Use `createAbortError(message)` for cancellation that crosses Node.js, Electron, or Eventa boundaries. It returns a serializable `Error` whose name is `AbortError`.

Do not pass a browser `MediaStream` to this package. Convert captured audio to mono `Float32Array` PCM in the application.
