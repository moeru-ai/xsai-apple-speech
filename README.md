# xsAI Apple Speech

[![npm version][npmx-version-src]][npmx-version-href]
[![npm downloads][npmx-downloads-src]][npmx-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]
[![JSDocs][jsdocs-src]][jsdocs-href]

xsAI Apple Speech provides batch and live, on-device transcription through Apple's macOS Speech framework. It supports direct Node.js use and Electron renderers through the same Provider interface.

The Provider uses `SpeechTranscriber` when it supports the selected locale. It falls back to `DictationTranscriber` when necessary.

## Requirements

- macOS 26 or later at runtime.
- Node.js 22.18 or later.
- Xcode 26 and the macOS 26 SDK when you build the native addon.
- An exact locale from `provider.getLocales()`. The Provider does not select a nearby locale.

The package reports structured unavailability on other systems. Importing it does not load the native addon.

## Packages

| Package                                            | Use it for                                               |
| -------------------------------------------------- | -------------------------------------------------------- |
| `@xsai-apple-speech/transcription`                 | Shared Provider types, errors, and Web Streams lifecycle |
| `@xsai-apple-speech/transcription-native`          | Direct Node.js or Electron main-process transcription    |
| `@xsai-apple-speech/transcription-electron-plugin` | Eventa transport and a renderer-safe Provider            |

The native package installs one optional architecture package for Darwin arm64 or x64. The repository also contains a private Fakemic test package; it is not published.

## Direct native use

```ts
import { createAppleSpeechProvider } from '@xsai-apple-speech/transcription-native'
import { generateTranscription } from '@xsai/generate-transcription'

const provider = createAppleSpeechProvider()
const availability = await provider.isAvailable()
if (!availability.available)
  throw new Error(`${availability.reason.code}: ${availability.reason.message}`)

const result = await generateTranscription({
  ...provider.transcription({ locale: 'en-US' }),
  file: new Blob([audioBytes], { type: 'audio/wav' }),
})

console.log(result.text)
```

The Provider loads a missing locale asset before transcription. Call `provider.load()` directly when you need progress or cancellation.

## Transcriber options

The `transcriber` option defaults to `automatic`. Basic use does not require an engine choice:

```ts
const transcription = provider.transcription({ locale: 'en-US' })
```

Automatic mode accepts overrides for both Apple transcribers. It applies only the overrides that belong to the selected transcriber.

```ts
const transcription = provider.transcription({
  analysisContext: {
    contextualStrings: {
      general: ['xsAI', 'AIRI'],
    },
  },
  locale: 'en-US',
  options: {
    attributes: {
      includeAudioTimeRange: true,
      includeTranscriptionConfidence: true,
    },
    contentHints: {
      farField: true,
    },
    reporting: {
      includeAlternativeTranscriptions: true,
      preferFastResults: false,
      preferFrequentFinalization: true,
    },
    transcription: {
      applyEtiquetteReplacements: true,
      includeEmoji: true,
      includePunctuation: true,
    },
  },
})
```

Set `transcriber` to `speech` or `dictation` when one engine is required. TypeScript then rejects options from the other engine.

`undefined` keeps the mode default. `true` enables an option. `false` disables an option that a mode enables by default.

Use a prepared custom language model with `DictationTranscriber`:

```ts
provider.transcription({
  locale: 'en-US',
  transcriber: 'dictation',
  options: {
    contentHints: {
      customizedLanguage: {
        modelConfiguration: {
          languageModel: '/absolute/path/to/model.bin',
          vocabulary: '/absolute/path/to/vocabulary.bin',
          weight: 0.7,
        },
      },
    },
  },
})
```

The Provider does not compile custom language model data. Compile the files with Apple's `SFSpeechLanguageModel` APIs first.

Filter locale discovery and asset loading when an application exposes an explicit engine choice:

```ts
const locales = await provider.getLocales({ transcriber: 'dictation' })
await provider.load({ locale: 'en-US', transcriber: 'dictation' })
```

## Live transcription

```ts
import { streamTranscription } from '@xsai-apple-speech/transcription'

const session = streamTranscription({
  ...provider.transcription({ locale: 'en-US' }),
  inputSampleRate: 48_000,
})

const writer = session.input.getWriter()
await writer.write(float32MonoSamples)
await writer.close()

console.log(await session.text)
```

Input is mono `Float32Array` PCM in the range `[-1, 1]`. Report the real input sample rate. Close the input for graceful completion, or call `session.dispose()` to cancel and release resources.

Use `createAbortError(message)` when cancellation must cross Node.js, Electron, or Eventa boundaries. It returns an `Error` named `AbortError`, so the failure keeps standard cancellation semantics without relying on `DOMException` serialization.

## Electron example

The complete example is in [`examples/electron`](./examples/electron). It demonstrates capability checks, locale loading, xsAI file transcription, microphone capture through an `AudioWorklet`, graceful stop, cancellation, and a live recognition-latency chart.

```sh
pnpm install
pnpm build
pnpm --filter @xsai-apple-speech/example-electron dev
```

The example `dev` script builds and stages the native addon before Electron starts.

## Development

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm build:native` builds the addon for the host architecture. `TARGET_ARCH=arm64` and `TARGET_ARCH=x86_64` select a release architecture on matching macOS 26 runners.

The verification layers and accepted design are in [the initial design notes](./docs/initial-design-notes.md). The source decisions are recorded in [`docs/adr`](./docs/adr).

## License

MIT

[npmx-version-src]: https://npmx.dev/api/registry/badge/version/@xsai-apple-speech/transcription
[npmx-version-href]: https://npmx.dev/@xsai-apple-speech/transcription
[npmx-downloads-src]: https://npmx.dev/api/registry/badge/downloads-month/@xsai-apple-speech/transcription
[npmx-downloads-href]: https://npmx.dev/@xsai-apple-speech/transcription
[bundle-src]: https://npmx.dev/api/registry/badge/size/@xsai-apple-speech/transcription
[bundle-href]: https://bundlephobia.com/result?p=@xsai-apple-speech/transcription
[license-src]: https://npmx.dev/api/registry/badge/license/@xsai-apple-speech/transcription
[license-href]: https://github.com/moeru-ai/xsai-apple-speech/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/@xsai-apple-speech/transcription
