# Apple Speech transcription: initial design notes

## Status

This document records the facts and proposals that exist before implementation starts.

The design interview will replace open proposals with confirmed decisions.

The public product is an Apple Speech Provider. The design has no public Runtime or Transport abstraction.

## Goal

The repository will provide an xsAI-compatible Provider for Apple on-device speech transcription.

The complete development path includes these parts:

- A shared Apple Speech Provider contract.
- A Provider backed by the native binding.
- A Provider for Electron renderers.
- A native Apple Speech bridge for Node.js and Electron.
- An Electron plugin for main-process and renderer-process integration.
- A small Electron example that verifies the complete path.
- npm packages that install the correct native artifact for the current macOS architecture.

## Confirmed first-release scope

The first release supports macOS 26 or later. It uses `SpeechAnalyzer` and `SpeechTranscriber`.

The first release supports these operations:

- Transcribe encoded audio as one request.
- Transcribe a live stream of normalized mono `Float32Array` samples.
- List supported and installed locales.
- Download a locale asset when Apple requires it.
- Cancel work and release all native resources.

Microphone capture stays outside the Apple Speech Provider. The Electron example owns microphone capture and the `MediaStream`-to-PCM adapter.

Windows, Linux, and older macOS versions are not transcription targets. Package import and Provider construction do not load the native addon.

## Verified source material

### AIRI pull request 2262

[AIRI pull request 2262](https://github.com/moeru-ai/airi/pull/2262) is the source prototype.

The prototype has these parts:

- A Swift static library uses `SpeechAnalyzer` and `SpeechTranscriber`.
- A raw Node-API bridge exposes the Swift implementation to Node.js.
- The native package supports encoded audio, local files, and live PCM16 audio.
- The renderer keeps microphone selection and voice activity detection.
- Eventa carries requests and audio streams between the Electron renderer and main process.
- Live results are complete, replaceable transcript values. They are not append-only text deltas.

Apple can revise volatile words and punctuation. A consumer must replace the prior transcript value with each new value.

The prototype has two known review concerns:

- The package must detect unsupported Xcode and SDK versions before compilation.
- An abort during native startup must close the native session and all pending work.

The prototype is macOS-only and private to the AIRI monorepo. It does not provide a reusable xsAI package or npm artifact matrix.

On 2026-08-22, the pull request remained open and had merge conflicts. Its single commit changed 27 files.

The independent repository reaches an installable prerelease before AIRI adopts it. Pull request 2262 is then rewritten to consume the prerelease packages.

The rewrite removes the embedded native package, native loader, Apple Speech Eventa contracts, Electron handlers, and renderer Provider Adapter from AIRI.

AIRI keeps its injeca composition, Provider registry metadata, settings UI, microphone capture, VAD, hearing pipeline, and integration tests.

The embedded prototype does not merge before this rewrite.

### xsai-transformers

[`@xsai-transformers/transcription`](https://github.com/moeru-ai/xsai-transformers/blob/main/packages/transcription/src/index.ts) shows the batch provider pattern.

Its provider returns xsAI request options with a custom `fetch` function. The function reads the `FormData` from `generateTranscription`, invokes a worker, and returns an OpenAI-compatible JSON response.

The useful design rule is the provider boundary. The new package does not need to copy its base64 conversion or its type assertions.

### sherpaw

[`@sherpaw/xsai-transcription`](https://github.com/moeru-ai/sherpaw/tree/main/packages/xsai-transcription) shows the streaming provider pattern.

Its design separates these concerns:

- The provider creates the object that `streamTranscription` consumes.
- The session owns recognizer state and lifecycle transitions.
- The stream API exposes writable audio input and readable result streams.
- Eventa defines worker requests and events.
- Resource ownership determines whether `dispose` terminates an injected worker.

The source names the provider result `SherpawSpeechTransport`. The README and example do not expose transport as a caller concept.

The Apple implementation follows the public provider pattern. Internal Electron and native communication does not become a public abstraction.

Sherpaw does not accept a browser `MediaStream` directly. Its playground converts the microphone track through a `MediaStreamAudioSourceNode` and an `AudioWorkletNode`. The worklet selects the first channel, converts the samples to 16 kHz, and sends `Float32Array` blocks to the writable input. [The research note](./research/media-stream-to-pcm.md) records this path and its sample-rate constraints.

### AUV

[`@auv-js/cli`](https://github.com/moeru-ai/auv/tree/main/js/packages/cli) shows a napi-rs npm release layout.

Its root package declares platform packages as optional dependencies. Its generated loader selects the package for the current platform and architecture.

The release workflow builds artifacts in a matrix. It then stages, verifies, and publishes the root and platform packages.

This layout is useful even if the Apple bridge does not use Rust. The generated napi-rs loader itself is not reusable without napi-rs.

The native Provider uses the same root-package and platform-package pattern:

```text
@xsai-apple-speech/transcription-native
@xsai-apple-speech/transcription-native-darwin-arm64
@xsai-apple-speech/transcription-native-darwin-x64
```

The root package lists both platform packages in `optionalDependencies`. Each platform package contains one architecture-specific `.node` file.

All packages use the same version. The first release does not publish a universal binary.

The root package loads the native addon lazily. Package import and Provider construction do not load the native addon.

`isAvailable()` returns `{ available: false, reason }` when the native framework is unavailable. Native package errors pass to the caller without a wrapper.

The other Provider operations use the same binding. A successful binding stays cached for the Provider lifetime.

An unavailable result contains a structured reason with a stable code and a message. The false variant always contains this reason.

The package exports `AppleSpeechUnavailableError`, which extends `XSAIError`. Unavailable `load`, `generate`, and `stream` operations throw this error.

The first release supports macOS 26.0 and later. Its build requires Xcode 26 and a macOS 26 SDK.

The Provider does not use `SFSpeechRecognizer` as a fallback.

The root package uses `createRequire(import.meta.url)` to load the package for `process.arch`.

Each platform package points its `main` field directly to its `.node` file. The root package does not use a third-party addon loader.

### stage-tamagotchi

[`stage-tamagotchi`](https://github.com/moeru-ai/airi/tree/main/apps/stage-tamagotchi) is the Electron integration reference.

The example must include the relevant runtime boundaries. A renderer-only demonstration cannot verify the native integration.

The example needs these layers:

- Electron main-process composition.
- A preload and renderer security boundary.
- Shared Eventa contracts.
- Main-process native service ownership.
- Renderer-side provider construction.
- macOS speech-recognition and microphone permissions.
- Development and packaged application paths for the native artifact.
- Shutdown and cancellation behavior.

The current Eventa Electron adapter exposes the raw `ipcMainEvent.sender`. Its `onlySameWindow` option filters replies but does not filter incoming handler execution.

The Electron plugin must derive ownership from the raw sender. It cannot trust an owner identifier from a renderer payload.

## Confirmed packages

```text
xsai-apple-speech/
  docs/
  packages/
    transcription/
    transcription-native/
    transcription-electron-plugin/
    vitest-plugin-fakemic/ # private test infrastructure
  examples/
    electron/
```

The packages use these published names:

- `@xsai-apple-speech/transcription`
- `@xsai-apple-speech/transcription-native`
- `@xsai-apple-speech/transcription-electron-plugin`

The private `@xsai-apple-speech/vitest-plugin-fakemic` workspace package is not part of the published package set.

On 2026-08-19, the public npm registry had no published package under any of these names.

The package responsibilities are confirmed:

- `transcription` owns the shared Provider contract, result types, and the live `streamTranscription` function.
- `transcription-native` loads the Node-API binding and creates a native Provider.
- `transcription-electron-plugin` connects Electron processes and creates a renderer Provider.

The native and Electron Providers must provide the same observable transcription behavior.

## Working API shape

The Provider has one `transcription` method for batch and live transcription. The method accepts one options object.

```ts
interface AppleSpeechTranscriptionOptions {
  locale: string
}
```

`locale` is the only first-release field. It accepts a BCP 47 string, such as `zh-CN`.

The shared contract converts requested and Apple locale identifiers to canonical BCP 47 form. The Provider then requires an exact supported-locale match.

The Provider does not select a related language, script, or region. An unsupported-locale error includes the request and the available canonical identifiers.

New settings can become optional object properties. The public API does not use positional overloads.

### Batch transcription

The root provider can follow the custom-fetch pattern from xsai-transformers.

```ts
const appleSpeech = createAppleSpeechProvider()
const transcription = appleSpeech.transcription({
  locale: 'zh-CN',
})

const result = await generateTranscription({
  ...transcription,
  file,
})
```

The custom `fetch` accepts the multipart request from `@xsai/generate-transcription`. It returns an OpenAI-compatible transcription response.

### Live transcription

The package exports its own `streamTranscription` function. This function accepts writable PCM input and follows the lifecycle model from sherpaw.

The existing `@xsai/stream-transcription` function accepts a complete Blob. It does not provide writable live audio input.

```ts
import { streamTranscription } from '@xsai-apple-speech/transcription'

const live = streamTranscription({
  ...appleSpeech.transcription({
    locale: 'zh-CN',
  }),
  inputSampleRate: 16_000,
})

const writer = live.input.getWriter()
await writer.write(float32Samples)
await writer.close()
await live.done
await live.dispose()
```

`inputSampleRate` is required. It reports the actual rate of the PCM chunks in hertz. It does not promise support for every rate.

The Provider selects an internal format that works with the active Apple Speech modules. This format can use a fixed sample rate.

Apple Speech does not resample analyzer input. The owned transcription path performs stateful resampling when the source and analyzer rates differ.

`live.input` is a `WritableStream<Float32Array>`. `getWriter()` returns a `WritableStreamDefaultWriter<Float32Array>` that locks this stream.

A caller can also pipe a `ReadableStream<Float32Array>` into `live.input`. This form preserves Web Streams backpressure without exposing a writer. A browser `MediaStream` is a collection of media tracks, not a Web `ReadableStream`, so it needs a PCM capture adapter before it can feed this input.

The live result exposes `partialStream` for replaceable transcript values.

```ts
interface TranscriptionRange {
  startMilliseconds: number
  durationMilliseconds: number
  isFinal: boolean
}

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

interface StreamTranscriptionResult {
  input: WritableStream<Float32Array>
  partialStream: ReadableStream<string>
  fullStream: ReadableStream<TranscriptionEvent>
  text: Promise<string>
  done: Promise<TranscriptionResult>
  dispose: () => Promise<void>
}
```

Each `partialStream` value is the current Partial Transcript. Consumers must replace the previous value instead of appending the new value.

`range.isFinal` applies only to the Result Range that caused the partial event. Only `transcript.text.done` completes the session.

## Proposed responsibility boundaries

### Shared transcription package

The shared package owns the Apple Speech Provider contract and transcription result semantics.

It does not own microphone capture, native loading, or Electron window lifecycle.

### Native Provider

The native package loads the Node-API binding and creates an Apple Speech Provider for the current process.

It owns Apple framework access, locale assets, analyzer sessions, cancellation, and native resource cleanup.

The Provider contract does not expose pointers, handles, or Swift-specific types.

### Electron plugin

The Electron plugin connects the renderer Provider to the native Provider in the main process.

It uses Eventa for typed requests and streams. The main side owns native resources. The renderer side creates an Apple Speech Provider.

The current proposal creates one global Electron main context without a bound `BrowserWindow`. `setupAppleSpeechTranscription` registers one handler set on this context.

Each renderer window uses its own Electron renderer context. The Electron adapter connects each renderer context to the global main context.

The native Provider is an application-scoped dependency. The global setup uses this Provider for all renderer invocations.

The Electron host must inject this Provider. The plugin does not create a default native Provider.

The setup does not accept separate handler overrides. A host can inject another Provider Adapter or wrap the Provider before injection.

Each invocation takes ownership from the raw Eventa sender. Responses use the inherited sender and do not broadcast transcription data.

The Eventa surface has five invokes: availability, locale inventory, locale loading, batch generation, and bidirectional live streaming.

[The Electron Eventa protocol proposal](./electron-eventa-protocol.md) defines their input, output, cancellation, and correlation semantics.

The main entrypoint exports `setupAppleSpeechTranscription`. The setup returns an object with an idempotent asynchronous `dispose()` method.

The setup owns its handler registrations and active invocation records. It does not own a second registry of Transcription Sessions.

Its disposer removes the handlers before it aborts and awaits active invocations. The disposer is asynchronous and idempotent.

The setup does not dispose the injected Provider or Eventa context. It does not unload the native binding or clear Provider locale state.

AIRI uses injeca to own the setup resource and call `dispose()`. The Electron example uses the same lifecycle model.

The plugin does not define transcription result or session semantics.

### Electron example

The example verifies both development and packaged execution.

It must exercise availability, locale selection, file transcription, live transcription, cancellation, permissions, and application shutdown.

The example owns microphone capture and the `MediaStream`-to-PCM adapter. The first release does not export this adapter from the Electron plugin.

The example uses Electron, electron-vite, Vue, and TypeScript. It contains one window and one renderer page.

The example keeps these runtime directories separate:

```text
src/
  main/
  preload/
  renderer/
  shared/
```

The main process uses injeca to compose the Eventa context, native Provider, Electron setup, and window.

The preload uses `contextBridge` to expose limited IPC access. The renderer creates its own Eventa context and Electron Provider.

The build supports Vite development URLs and packaged local files. The electron-builder configuration keeps ASAR enabled and unpacks native `.node` files.

The macOS application declares microphone and speech-recognition usage descriptions. It also includes the required entitlements.

The application disposes the Electron setup before it disposes the Eventa context.

The example does not copy AIRI routing, Pinia stores, or multi-window product features.

The renderer page contains three test areas:

- Capability and Locale calls `isAvailable`, lists locales, loads one locale, reports progress, and cancels one load operation.
- Batch Transcription selects an audio file, calls xsAI `generateTranscription`, reports the result, and supports abort.
- Live Transcription captures a microphone, converts its `MediaStream` through an `AudioWorklet`, and sends the actual sample rate.

The live area replaces its current Partial Transcript for each `partialStream` value. It also displays the ordered `fullStream` events.

The Stop action closes the writable input and waits for graceful completion. The Cancel action calls `dispose()` and waits for cancellation cleanup.

After completion or cancellation, the page can start a new Transcription Session. The page also displays permission, operation, and error states.

## Native binding

The AIRI prototype proves that a raw Node-API bridge can call the Swift implementation.

AUV proves that napi-rs can generate loaders and platform package release infrastructure. It does not prove that Rust improves this Apple-only bridge.

The first release uses the raw Node-API option:

| Option                                    | Result                         | Reason                                                   |
| ----------------------------------------- | ------------------------------ | -------------------------------------------------------- |
| Raw Node-API with Swift and Objective-C++ | Accepted                       | Reuses the prototype and keeps one foreign-function seam |
| napi-rs with a Rust bridge to Swift       | Rejected for the first release | Adds Rust and another foreign-function seam              |
| A native executable with IPC              | Rejected for the first release | Adds process lifecycle, framing, and distribution work   |

Swift owns the speech implementation. The Objective-C++ adapter owns Node-API conversion and callback delivery.

The repository uses AUV as a reference for package topology and release automation. It does not copy the generated napi-rs loader.

## Lifecycle requirements

The native and Electron layers need one documented state model.

Availability, locale inventory, and locale loading use Provider scope. These operations do not create a Transcription Session.

One Provider supports multiple concurrent Transcription Sessions. Each `generate` and `stream` operation creates one session.

A `generate` operation hides its session handle and disposes the session after the operation settles.

A `streamTranscription` result is the live session handle. It owns one session until completion or disposal.

Session `dispose` is idempotent and affects only its owning session. The Provider has no global `dispose` method.

The global setup aborts its active invocation when its renderer aborts or its raw Electron sender is destroyed. Eventa invocation identifiers remain internal correlation keys.

The AIRI prototype already isolates native sessions in a UUID-keyed registry.

The implementation uses these internal transitions:

```text
starting -> active -> finishing -> completed
    |          |          |
    +----------+----------+-> failed

starting | active | finishing
    -> disposing
    -> disposed
```

`starting` contains locale loading, native startup, and Eventa startup. `active` means that the native session can process audio.

`finishing` owns graceful flush and finalization. `disposing` owns cancellation cleanup.

`completed`, `failed`, and `disposed` are terminal states with no owned resources. The public result does not expose these states.

Closing the writable input requests graceful completion. The session flushes converted audio and finalizes through the end of the analyzer input.

A successful session emits one `transcript.text.done` event. It releases native and IPC resources before `done` resolves.

Calling `dispose()` before completion cancels the session. It emits no done event and rejects unfinished outputs with `AbortError`.

`dispose()` is idempotent. Calls after successful completion have no effect.

The TypeScript layer allocates an internal session identity before startup. The result can call `dispose()` while locale assets or native resources load.

Locale asset download, native startup, and the Eventa request share the session cancellation scope. `dispose()` waits for their cleanup.

Every startup completion checks its session identity and state. A stale completion releases any late resource and cannot register the session.

A disposed result cannot restart. The same Provider can create a new result with a different internal identity.

`writer.abort(reason)` uses the same cancellation operation as `dispose()`. Its returned promise waits for cleanup.

An explicit abort reason becomes the readable-stream error and promise rejection. An omitted reason and direct `dispose()` use `AbortError`.

The `generate` and `stream` operations load missing locale assets automatically. The explicit `load` operation supports preload flows and progress interfaces.

Each load request or transcription startup owns one native operation. Apple consolidates repeated system installation requests.

The public `load` options contain `abortSignal?: AbortSignal`. The Electron Provider maps this signal to the Eventa invocation options.

The signal is not part of the serialized Eventa payload. Automatic loads use the signal of their owning transcription operation.

Cancellation stops only the matching Swift task. If the Apple progress reports `isCancellable`, the native layer cancels it.

## Data contract requirements

The public live input uses `WritableStream<Float32Array>`. Each array contains normalized mono samples in the range `[-1, 1]`.

A browser `MediaStream` is not part of this data contract. The Electron example converts it into mono PCM chunks and reports the sample rate.

The Electron example reports the actual `AudioContext` sample rate. It does not declare 16 kHz unless its output is 16 kHz.

Each Transcription Session owns one persistent `AVAudioConverter` in the native package. The session bypasses conversion when Apple accepts the source format.

Web Audio can perform an optional early conversion in the Electron example. The native package still validates the declared format and keeps conversion support.

The converter keeps state across chunks. The finish path flushes buffered converted audio before it completes the analyzer.

[The resampling research](./research/audio-resampling-options.md) compares `AVAudioConverter`, Web Audio, and MediaBunny. The first release does not add MediaBunny.

Audio data must cross each internal boundary as a typed binary value. The design must avoid base64 and `number[]` for live audio.

The native package owns conversion to its required sample encoding. PCM16 and byte order are not public API concepts.

The start frame must declare the locale, sample rate, channel count, and sample format. Audio frames must contain only audio bytes.

Every stream needs a correlation identity when one Provider can own multiple sessions. Ignored and stale events need an explicit rule.

The final result must distinguish these concepts:

- The current complete transcript value.
- The Apple range that caused the update.
- The final state of that range.
- The final state of the complete session.

## Compatibility questions

The design must distinguish build-time support from runtime support.

- The build requires a Swift compiler and an Apple SDK that contain the required Speech APIs.
- Runtime availability depends on the macOS version and Apple framework capability checks.
- Locale support and installed locale assets are runtime state.
- Electron uses a Node ABI. The package must verify the intended ABI compatibility contract.
- The native package import must keep the original Node.js error.

## Test layers

The planned verification has five layers:

1. Package unit tests cover locale logic, native loading, load coordination, session lifecycle, and stream semantics.
2. Eventa contract tests use real in-memory contexts and a fake Provider for all five invokes.
3. Native tests cover session startup, audio input, finish, abort, and cleanup.
4. Fakemic tests run the same Electron audio cases against development and packaged application builds.
5. A release dry run inspects every npm package and installs the root package in a clean project.

The development Fakemic project launches the electron-vite main output. The packaged project launches the electron-builder application executable.

The packaged project includes ASAR, native-addon unpacking, application metadata, and the selected platform package.

The Vitest unit and Eventa contract projects do not start Electron. Only the Fakemic projects start a real Electron process.

Pull requests require deterministic checks. These checks cover lint, type checks, unit tests, Eventa contract tests, and native builds for arm64 and x64.

The required checks also cover native-addon package probes, Electron builds, ASAR contents, and native-addon unpacking.

A required Playwright check launches the packaged application. The launch does not create a real Apple Speech session.

Real `SpeechAnalyzer` tests start as non-required integration checks on arm64. Fakemic runs the same audio case against development and packaged Electron builds.

Each real test calls `load()` for its selected locale. It records these diagnostics:

- Microphone discovery and device selection.
- Capture results and permission status.
- Load progress.
- Transcription results and errors.

The project adds an Intel real-transcription job after the arm64 job is stable.

A real-transcription job becomes required after repeated runs succeed on fresh hosted runners.

If permissions or locale assets remain unstable, the real-transcription tests move to a prepared self-hosted Mac.

[The macOS Electron CI research note](./research/ci-macos-electron.md) records runner architectures, Xcode images, packaged launch support, and runtime uncertainties.

AIRI provides `@proj-airi/vitest-plugin-fakemic` for deterministic microphone tests. It launches Web or Electron runtimes with a file-backed Chromium microphone.

The application still uses `enumerateDevices`, `getUserMedia`, and its normal audio processing path. Thus, Fakemic can exercise the example microphone and `AudioWorklet` path.

The AIRI package is private and uses a workspace version. The independent repository cannot consume it as a published dependency in its current form.

The first implementation copies the Fakemic module into this repository as private test infrastructure. It preserves the existing interface and source attribution.

The project will evaluate this copy through the Electron example tests. A later decision can extract and publish it after both repositories prove the interface.

[The Fakemic research note](./research/airi-fakemic.md) records its interface, runtime behavior, and reuse options.

## Open decisions

The initial design interview has no open decisions.

The accepted ADRs record these decisions:

- ADR 0002 records the package names.
- ADR 0004 records the Provider-only model.
- ADR 0005 records `streamTranscription`.
- ADR 0006 and ADR 0007 record live output semantics.
- ADR 0008 records session isolation.
- ADR 0009 records live audio input.
- ADR 0010 records `MediaStream` adapter ownership.
- ADR 0011 records Locale normalization and matching.
- ADR 0012 records input sample-rate and resampling policy.
- ADR 0013 records completion and disposal semantics.
- ADR 0014 records startup cancellation and stale completion handling.
- ADR 0015 records writable abort error propagation.
- ADR 0016 records the rejected per-window handler registration.
- ADR 0017 records the superseded four-invoke contract.
- ADR 0018 records the `getLocales` response structure.
- ADR 0019 records the `load` invoke, progress stream, and setup lifecycle.
- ADR 0020 records the `load` progress values.
- ADR 0021 records automatic loading for transcription operations.
- ADR 0025 records the public load-cancellation signal.
- ADR 0027 records the internal session lifecycle states.
- ADR 0028 records the raw Node-API bridge.
- ADR 0029 records the Darwin platform package topology.
- ADR 0030 records lazy native addon loading.
- ADR 0031 records macOS 26 support without a legacy fallback.
- ADR 0032 records the direct architecture-package import.
- ADR 0033 records structured unavailability reasons and errors.
- ADR 0034 records the Provider and Transcription Session scopes.
- ADR 0035 records the automatic binding between a live invoke and a Transcription Session.
- ADR 0036 records the required Provider seam for the Electron setup.
- ADR 0037 records cleanup ownership for the Electron setup.
- ADR 0038 records the complete runtime and package structure for the Electron example.
- ADR 0039 records the required user flows for the Electron example.
- ADR 0040 records local incubation for the copied Fakemic module.
- ADR 0041 records the private Fakemic workspace package.
- ADR 0042 records the five-layer automated verification matrix.
- ADR 0043 records required deterministic checks and non-required real-transcription checks.
- ADR 0044 records the prerelease-first rewrite of AIRI pull request 2262.
