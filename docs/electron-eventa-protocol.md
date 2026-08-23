# Electron Eventa protocol proposal

## Status

This document describes the Eventa contract for the Electron plugin. ADR 0019 accepts its operation structure. ADR 0035 accepts its live-session binding.

ADR 0036 accepts the required Provider seam in the main process.

ADR 0037 accepts cleanup ownership for the setup resource.

The contract uses five invoke definitions. The first release has no independent fire-and-forget events.

| Invoke        | Renderer input                       | Main-process output              | Eventa pattern       |
| ------------- | ------------------------------------ | -------------------------------- | -------------------- |
| `isAvailable` | No payload                           | One availability result          | Unary                |
| `getLocales`  | No payload                           | One locale inventory             | Unary                |
| `load`        | One locale                           | A stream of load progress        | Server stream        |
| `generate`    | One encoded audio request            | One final transcription result   | Unary                |
| `stream`      | A stream of control and audio frames | A stream of transcription events | Bidirectional stream |

Eventa generates the request, response, stream-end, error, and abort frames for each invoke. These frames are Eventa implementation details.

## Shared definitions

The Electron plugin owns the Eventa definitions. The renderer and main-process entrypoints import the same values.

```ts
import { defineInvokeEventa } from '@moeru/eventa'

export const appleSpeechIsAvailable = defineInvokeEventa<
  AppleSpeechAvailability,
  undefined
>('xsai-apple-speech:transcription:is-available')

export const appleSpeechGetLocales = defineInvokeEventa<
  GetLocalesResult,
  undefined
>('xsai-apple-speech:transcription:get-locales')

export const appleSpeechLoad = defineInvokeEventa<
  AppleSpeechLoadProgress,
  { locale: string }
>('xsai-apple-speech:transcription:load')

export const appleSpeechGenerate = defineInvokeEventa<
  TranscriptionResult,
  GenerateTranscriptionRequest
>('xsai-apple-speech:transcription:generate')

export const appleSpeechStream = defineInvokeEventa<
  TranscriptionEvent,
  StreamInputFrame
>('xsai-apple-speech:transcription:stream')
```

The event identifiers in this example are provisional. The payload semantics below are the current proposal.

## Availability invoke

The renderer sends no payload. The main process returns the availability state and an optional reason.

```ts
interface AppleSpeechAvailability {
  available: boolean
  reason?: string
}
```

The invoke reports runtime availability. `reason` explains an unavailable result. The invoke does not load or return the locale inventory.

The native package loads its `.node` file lazily during this check. Importing the package and registering the Eventa handlers do not load it.

The result reports an unavailable Apple framework feature. Eventa passes native package errors without a custom envelope.

The other four invokes use the same availability check. If the result is unavailable, they fail through the Eventa error path with the same reason.

## Locales invoke

The renderer sends no payload. The main process returns the current supported and installed locale state.

```ts
interface AppleSpeechLocale {
  locale: string
  installed: boolean
}

type GetLocalesResult = AppleSpeechLocale[]
```

`locale` is a canonical BCP 47 identifier. `installed` reports whether the required locale assets are currently installed.

## Load invoke

The renderer sends one canonical BCP 47 locale identifier. The main process loads the assets for that locale.

The invoke returns a response stream. Each value reports progress from the Apple `AssetInstallationRequest.progress` object.

```ts
type AppleSpeechLoadProgress
  = {
    status: 'progress'
    locale: string
    progress: number
  }
  | {
    status: 'ready'
    locale: string
  }
```

`progress` uses the inclusive range from `0` to `100`. The main process emits one `ready` value before it closes the response stream.

The response stream ends after `downloadAndInstall()` succeeds. An installed locale can emit `ready` without a preceding progress value.

An Eventa abort cancels the active load operation. A load error uses the Eventa error path.

The shared Provider exposes the load operation with an optional progress callback.

```ts
interface LoadAppleSpeechOptions {
  locale: string
  abortSignal?: AbortSignal
  onProgress?: (progress: AppleSpeechLoadProgress) => Promise<void> | void
}

await provider.load({
  locale: 'zh-CN',
  onProgress: progress => updateProgress(progress),
})
```

The Electron Provider consumes the Eventa response stream and calls `onProgress` for each value.

The Electron Provider passes `abortSignal` as the Eventa invocation `signal`. It does not include the signal in the serialized request payload.

If the signal is already aborted, the Provider does not start an invocation. The Provider removes its abort listener after the operation settles.

xsai-transformers uses the same projection for its worker load stream. Apple provides real progress through the [`ProgressReporting`](https://developer.apple.com/documentation/speech/assetinstallationrequest) conformance.

## Concurrent locale loads

Each `load` call owns one native operation and one progress callback. Concurrent calls do not share Provider state.

Apple consolidates repeated installation requests. The Provider does not add another consolidation layer.

An abort cancels only its native operation. Other load calls continue independently.

## Batch transcription invoke

The renderer converts the source `File` or `Blob` into bytes before the invoke.

```ts
interface GenerateTranscriptionRequest {
  locale: string
  audio: Uint8Array
  fileName?: string
  mediaType?: string
}

interface TranscriptionResult {
  text: string
  locale: string
}
```

`fileName` and `mediaType` describe the encoded audio. The native Provider uses them to select the input decoder.

The main process validates the locale during this invoke. It loads missing locale assets before transcription starts.

The automatic load does not report progress through `generate`. If a caller needs progress, it invokes `load` before `generate`.

## Live transcription invoke

The renderer passes a `ReadableStream<StreamInputFrame>` to `defineStreamInvoke`. The first frame starts the Transcription Session.

```ts
type StreamInputFrame
  = {
    type: 'start'
    locale: string
    inputSampleRate: number
    channelCount: 1
    sampleFormat: 'float32'
  }
  | {
    type: 'audio'
    samples: Float32Array
  }
```

The request contains exactly one `start` frame. All later frames contain normalized mono samples in the range `[-1, 1]`.

Each accepted `stream` invocation creates exactly one Transcription Session. The handler creates the session after it receives a valid `start` frame.

The invocation does not attach to an existing session. It does not create a public session identifier.

The main process loads missing locale assets before it starts the native session. This startup remains part of the `stream` cancellation scope.

The automatic load does not report progress through `stream`. If a caller needs progress, it invokes `load` before `stream`.

The output uses the shared transcription events.

```ts
type TranscriptionEvent
  = {
    type: 'transcript.text.partial'
    text: string
    locale: string
    range: TranscriptionRange
  }
  | {
    type: 'transcript.text.done'
    text: string
    locale: string
  }
```

The main process emits zero or more partial events. It then emits exactly one done event and closes the response stream.

The request-stream end asks the native Provider to finish. Eventa abort cancels the session and preserves the abort reason.

Protocol and native errors use the Eventa error path. They are not transcription events.

## Correlation and ownership

Eventa assigns an `invokeId` to each batch or streaming invocation. This identifier is the internal correlation key.

The public payload does not contain a `sessionId`. The renderer cannot select or claim another renderer's session.

The Electron plugin does not keep a second session registry. A host can wrap its injected Provider to observe or track live sessions.

The main-process handler reads `options.raw.ipcMainEvent.sender`. This sender owns the invocation and all native resources that it creates.

The global Electron main context sends each response through the inherited raw sender. It does not broadcast transcription data to other windows.

The setup must cancel active work when the renderer sender is destroyed. A normal Eventa abort and renderer destruction use the same native cancellation operation.

## Proposed composition

The main process creates one Electron Eventa context without a bound `BrowserWindow`. It registers the Apple Speech handlers once.

```ts
const { context, dispose: disposeContext } = createContext(ipcMain)

const appleSpeech = setupAppleSpeechTranscription({
  context,
  provider: nativeProvider,
})
```

The `provider` dependency is required. The Electron host constructs and owns it.

The setup does not create a default native Provider. It does not accept separate handler overrides for the five operations.

A host can supply another Provider Adapter or wrap a Provider before injection. The five handlers keep the same Provider semantics.

Each renderer window uses its own Electron renderer context. The renderer package creates a Provider that invokes the five shared definitions.

```ts
const provider = createAppleSpeechTranscriptionProvider({
  context: rendererContext,
})
```

The Electron adapter carries requests between these contexts. The plugin does not register a handler set for each window.

The setup function returns an object with one idempotent asynchronous `dispose()` method.

```ts
interface AppleSpeechTranscriptionSetup {
  dispose: () => Promise<void>
}

await appleSpeech.dispose()
disposeContext()
```

The setup disposer first removes all five handlers. It then aborts and awaits the active invocations that entered through these handlers.

The setup tracks invocation cleanup, not a second registry of Transcription Sessions. It does not dispose the Provider or Eventa context.

The setup also does not unload the native binding or clear the Provider locale state.

AIRI uses injeca to own this setup resource. The Electron example uses the same ownership and cleanup order.

The setup does not resolve the native binding. It can register all handlers on a system that reports unavailable.

## Difference from AIRI pull request 2262

The source prototype uses three Eventa invokes. Its stream starts with a control frame and continues with audio frames.

This proposal changes these details:

- The Eventa definitions move into the published Electron plugin.
- Availability and locale inventory use separate invokes.
- Locale asset installation uses a `load` invoke with progress.
- Live audio stays as `Float32Array` until the native Provider converts it.
- The stream output uses partial and done events from the shared package.
- The global setup registers one handler set for all renderer windows.
- Renderer ownership comes from the raw Electron sender.
- Each live invocation creates one session without a public `sessionId`.
