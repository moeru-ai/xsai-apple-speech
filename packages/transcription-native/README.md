# `@xsai-apple-speech/transcription-native`

This package implements the Apple Speech Provider with a lazy Node-API addon. It uses `SpeechAnalyzer` on macOS 26 or later.

The Provider supports `SpeechTranscriber` and `DictationTranscriber`. Automatic mode selects `SpeechTranscriber` first and falls back by locale.

```ts
import { createAppleSpeechProvider } from '@xsai-apple-speech/transcription-native'

const provider = createAppleSpeechProvider()
console.log(await provider.isAvailable())
```

Use an explicit transcriber when an application needs its specific options:

```ts
const transcription = provider.transcription({
  locale: 'en-US',
  transcriber: 'dictation',
  options: {
    contentHints: {
      shortForm: true,
    },
    transcription: {
      includeEmoji: true,
      includePunctuation: true,
    },
  },
})
```

The native package resolves file and stream defaults in separate `options.ts` modules. Both modules use `@moeru/std` merge semantics.

Use it in Node.js or an Electron main process. Do not bundle it into an Electron renderer. The first Provider operation loads the native package. A native package error passes to the caller without a wrapper.

## Native build

The build needs Xcode 26, the macOS 26 SDK, and Node.js headers.

```sh
pnpm build:native
pnpm --filter @xsai-apple-speech/transcription-native test:native
```

`build:native` writes the addon to `npm/darwin-<architecture>/apple-speech-transcription.node`. Release CI builds arm64 and x64 on matching machines. It does not cross-compile between runner architectures.

The native layer accepts mono Float32 PCM. It keeps one `AVAudioConverter` per live session and converts the declared input sample rate into the analyzer format.
