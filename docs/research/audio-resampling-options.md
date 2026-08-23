# Streaming audio resampling options

Date: 2026-08-21

This note compares three resampling paths for live Apple Speech transcription. It separates verified facts from the project recommendation.

## Verified facts

### Apple Speech and AVAudioConverter

`SpeechAnalyzer` does not convert its audio input. Each `AnalyzerInput` must use a format that the active modules support. Apple tells clients to select that format with `bestAvailableAudioFormat(compatibleWith:considering:)`. The `considering` overload accepts the source format as a preference. It returns `nil` when required assets are not installed. [AnalyzerInput](https://developer.apple.com/documentation/speech/analyzerinput) and [bestAvailableAudioFormat](https://developer.apple.com/documentation/speech/speechanalyzer/bestavailableaudioformat%28compatiblewith%3Aconsidering%3A%29)

`AVAudioConverter` converts streams between audio formats. Its supported operations include PCM sample-rate conversion, channel conversion, and sample-format conversion. Sample-rate conversion requires the callback-based `convert(to:error:withInputFrom:)` method. The simpler buffer-to-buffer method does not support sample-rate conversion. [AVAudioConverter](https://developer.apple.com/documentation/avfaudio/avaudioconverter) and [TN3136](https://developer.apple.com/documentation/technotes/tn3136-avaudioconverter-performing-sample-rate-conversions)

The converter keeps stream-related priming state. Its input callback distinguishes temporary input exhaustion from the end of the stream. Apple describes `.none` as useful for live input, but it can add converter latency. The project must measure the prime mode before it selects one. [AVAudioConverterPrimeMethod](https://developer.apple.com/documentation/avfaudio/avaudioconverterprimemethod)

The local Xcode 26.6 installation contains the macOS 26.5 SDK. Its `Speech.swiftinterface` exposes both `bestAvailableAudioFormat` overloads and `AnalyzerInput(buffer:)`. Its `AVAudioConverter.h` contains the callback statuses, priming rules, and conversion methods. The current Apple website also documents a beta `AnalyzerInputConverter`, but that type is absent from this local SDK. The first implementation cannot depend on it.

### Web Audio

An `AudioContext` can request a sample rate. The constructor must throw `NotSupportedError` when that rate is unsupported. All nodes in one context process audio at the context rate. [Web Audio `AudioContextOptions`](https://www.w3.org/TR/webaudio-1.1/#dom-audiocontextoptions-samplerate) and [`BaseAudioContext.sampleRate`](https://www.w3.org/TR/webaudio-1.1/#dom-baseaudiocontext-samplerate)

The Web Audio specification requires a `MediaStreamAudioSourceNode` to resample its track when the track rate differs from the context rate. Therefore, an `AudioWorkletNode` receives PCM at the context rate. The user agent selects the resampling implementation and quality. [MediaStreamAudioSourceNode](https://www.w3.org/TR/webaudio-1.1/#MediaStreamAudioSourceNode)

This path fits an Electron renderer because `AudioContext` and `AudioWorkletNode` are Window APIs. It does not provide the same implementation in Electron's main process or the native package.

### MediaBunny

MediaBunny supports browsers. Its `@mediabunny/server` extension supports Node, Bun, and Deno through NodeAV. The server documentation includes Electron examples, so MediaBunny is not limited to browsers. [MediaBunny README](https://github.com/Vanilagy/mediabunny/blob/1c4d1c70a899cc6175fd3888cc9a266d0970d23f/README.md) and [`@mediabunny/server`](https://github.com/Vanilagy/mediabunny/blob/1c4d1c70a899cc6175fd3888cc9a266d0970d23f/packages/server/README.md)

MediaBunny can capture a live `MediaStreamAudioTrack`. Its public source sends audio into an encoder and output container. It is not a standalone `Float32Array` input and output resampler. [MediaStreamAudioTrackSource source](https://github.com/Vanilagy/mediabunny/blob/1c4d1c70a899cc6175fd3888cc9a266d0970d23f/src/media-source.ts#L2543-L2760)

MediaBunny has an `AudioResampler` class, but the package entry point does not export it. The encoder owns it as an internal implementation detail. The resampler also buffers five seconds of output. [Exports](https://github.com/Vanilagy/mediabunny/blob/1c4d1c70a899cc6175fd3888cc9a266d0970d23f/src/index.ts#L70-L86) and [resampler construction](https://github.com/Vanilagy/mediabunny/blob/1c4d1c70a899cc6175fd3888cc9a266d0970d23f/src/resample.ts#L18-L49)

The implementation uses linear interpolation. Its source states that this method gives suboptimal downsampling results because it does not apply a low-pass filter. This implementation is unsuitable as the quality baseline for speech input. [Resampling loop](https://github.com/Vanilagy/mediabunny/blob/1c4d1c70a899cc6175fd3888cc9a266d0970d23f/src/resample.ts#L198-L248)

The public `Conversion` API can resample audio, but it models media-file input and output. Using it only to transform live PCM would add an encoder and container pipeline that this project does not need. [Conversion source](https://github.com/Vanilagy/mediabunny/blob/1c4d1c70a899cc6175fd3888cc9a266d0970d23f/src/conversion.ts#L588-L606)

## Recommendation

Keep `inputSampleRate` required and do not fix the public PCM rate before the implementation spike.

Use this native session pipeline:

```text
Float32Array chunks and inputSampleRate
  -> mono AVAudioPCMBuffer at the declared source rate
  -> bestAvailableAudioFormat(compatibleWith:considering: sourceFormat)
  -> persistent AVAudioConverter when the formats differ
  -> AnalyzerInput
  -> SpeechAnalyzer
```

Create one converter per transcription session. Keep it alive across chunks. Flush it when the input closes. Do not convert when Apple selects the source format unchanged.

The Electron example can request the analyzer target rate from the provider before it creates its `AudioContext`. Web Audio can then resample the microphone track before the worklet emits PCM. However, the native layer must still validate the declared rate and retain conversion support. Browser behavior and other callers cannot guarantee the target rate.

Do not add MediaBunny for the first implementation. Its public API does not expose a suitable live PCM resampler. Its internal resampler has unsuitable latency and downsampling quality for this use case.

Treat a fixed-rate implementation as an acceptable fallback only if the native spike finds an Apple API constraint. If that occurs, expose the required rate as a provider capability. Reject mismatched input with a clear error. Do not silently interpret samples at another rate.

## Implementation checks

The native spike must make sure that:

- `bestAvailableAudioFormat` returns a usable format for installed locale assets.
- 44.1 kHz and 48 kHz mono input both reach the analyzer.
- Chunk boundaries do not add gaps, duplicate samples, or reset converter state.
- End-of-stream flushes delayed converter output before analyzer finalization.
- Web Audio reports the actual context rate, including the unsupported-rate error path.
