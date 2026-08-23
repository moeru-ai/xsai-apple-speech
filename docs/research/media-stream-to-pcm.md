# MediaStream to live PCM

## Status

This note records research only. It does not select the public API or a resampling implementation.

The Sherpaw findings use commit [`656837c`](https://github.com/moeru-ai/sherpaw/tree/656837c687fa85814e67c7c1959c4c19e887ddb4).

## Direct answer

A `MediaStream` cannot connect directly to `WritableStream<Float32Array>`.

`MediaStream` contains media tracks. It does not expose PCM chunks through the Web Streams interface. The Web Audio API converts its audio track into an audio graph source through [`createMediaStreamSource()`](https://www.w3.org/TR/webaudio-1.1/#dom-audiocontext-createmediastreamsource).

The proposed input accepts PCM chunks:

```ts
WritableStream<Float32Array>
```

An adapter must perform this conversion:

```text
MediaStream
  -> MediaStreamAudioSourceNode
  -> AudioWorkletNode
  -> MessagePort messages with Float32Array data
  -> WritableStreamDefaultWriter<Float32Array>.write()
```

Sherpaw uses this exact pipeline in its playground. It creates the source node and worklet in [`setupRecorder()`](https://github.com/moeru-ai/sherpaw/blob/656837c687fa85814e67c7c1959c4c19e887ddb4/playgrounds/xsai/src/App.vue#L245-L275). It then connects both nodes and the audio destination in [`startRecording()`](https://github.com/moeru-ai/sherpaw/blob/656837c687fa85814e67c7c1959c4c19e887ddb4/playgrounds/xsai/src/App.vue#L287-L325).

## Sherpaw input format

Sherpaw exposes `input` as [`WritableStream<Float32Array>`](https://github.com/moeru-ai/sherpaw/blob/656837c687fa85814e67c7c1959c4c19e887ddb4/packages/xsai-transcription/src/stream-transcription/types.ts#L61-L68). Each write sends one array of samples and the declared input sample rate to the provider ([executor source](https://github.com/moeru-ai/sherpaw/blob/656837c687fa85814e67c7c1959c4c19e887ddb4/packages/xsai-transcription/src/stream-transcription/execute.ts#L210-L220)).

The playground has these format properties:

- The data type is `Float32Array`.
- The worklet reads only `inputs[0][0]`. Thus, it selects the first channel instead of downmixing all channels.
- The target sample rate is 16 kHz.
- The worklet sends each processed block through its `MessagePort`.
- The renderer writes each received array to the transcription writer.

The worklet implements the channel selection and 16 kHz conversion in [`audio-processor.worklet.ts`](https://github.com/moeru-ai/sherpaw/blob/656837c687fa85814e67c7c1959c4c19e887ddb4/playgrounds/xsai/src/audio-processor.worklet.ts#L8-L60). The renderer obtains the writer and writes the arrays in [`App.vue`](https://github.com/moeru-ai/sherpaw/blob/656837c687fa85814e67c7c1959c4c19e887ddb4/playgrounds/xsai/src/App.vue#L195-L239).

The ASR declaration documents normalized `Float32Array` waveform samples in the range `[-1, 1]` ([source](https://github.com/moeru-ai/sherpaw/blob/656837c687fa85814e67c7c1959c4c19e887ddb4/packages/asr/src/asr.d.ts#L196-L203)). The live recognizer uses the same `acceptWaveform(sampleRate, samples)` shape.

Sherpaw does not define a fixed public chunk length. An `AudioWorkletProcessor` receives arrays for each render quantum. The Web Audio default quantum size is 128 frames, but the specification permits another configured size ([Web Audio rendering model](https://www.w3.org/TR/webaudio-1.1/#render-quantum-size)).

## Sherpaw sample-rate behavior

`inputSampleRate` is optional in Sherpaw's request type. The provider copies `model.sampleRate` into this field ([provider source](https://github.com/moeru-ai/sherpaw/blob/656837c687fa85814e67c7c1959c4c19e887ddb4/packages/xsai-transcription/src/provider.ts#L292-L296)). The session uses the per-write rate first. It then uses the session rate, which defaults to 16 kHz ([session source](https://github.com/moeru-ai/sherpaw/blob/656837c687fa85814e67c7c1959c4c19e887ddb4/packages/xsai-transcription/src/session.ts#L37-L57)).

The playground aligns all related values to 16 kHz:

- The model feature configuration uses 16 kHz.
- `inputSampleRate` is 16 kHz.
- `new AudioContext({ sampleRate: 16000 })` requests 16 kHz.
- The worklet reports and produces 16 kHz.

The relevant setup is in [`App.vue`](https://github.com/moeru-ai/sherpaw/blob/656837c687fa85814e67c7c1959c4c19e887ddb4/playgrounds/xsai/src/App.vue#L195-L210) and [`startRecording()`](https://github.com/moeru-ai/sherpaw/blob/656837c687fa85814e67c7c1959c4c19e887ddb4/playgrounds/xsai/src/App.vue#L306-L325).

Web Audio gives two important guarantees and one limitation:

- All nodes in an `AudioContext` use the context sample rate ([`BaseAudioContext.sampleRate`](https://www.w3.org/TR/webaudio-1.1/#dom-baseaudiocontext-samplerate)).
- A `MediaStreamAudioSourceNode` resamples its track to the context rate when the two rates differ ([source-node specification](https://www.w3.org/TR/webaudio-1.1/#MediaStreamAudioSourceNode)).
- A requested context rate can fail with `NotSupportedError` when the browser does not support that rate ([`AudioContextOptions.sampleRate`](https://www.w3.org/TR/webaudio-1.1/#dom-audiocontextoptions-samplerate)).

The capture constraint is not a reliable substitute for the context rate. `sampleRate` is a media constraint, and `getSettings()` reports the value that the browser selected ([Media Capture settings](https://w3c.github.io/mediacapture-main/#dom-mediastreamtrack-getsettings)). The audio graph can still resample this value to its context rate.

Sherpaw also contains a local resampler in the worklet. It averages source samples into 16 kHz output blocks when the worklet rate differs. This code keeps no filter state between worklet calls. Therefore, the playground demonstrates explicit conversion, not direct `MediaStream` support.

## Adapter options and compatibility

| Option                                     | Input and output                                                         | Compatibility facts                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web Audio with `AudioWorklet`              | `MediaStream` to audio graph to channel `Float32Array`                   | This is the path used by Sherpaw. It works in a Chromium renderer and keeps capture work off the renderer thread. Application code must select or downmix channels and handle the sample rate.                                                                                                                                           |
| Web Audio with a requested target rate     | The source node resamples to `AudioContext.sampleRate`                   | This can remove a separate resampling step. Construction can fail when the requested rate is unsupported.                                                                                                                                                                                                                                |
| `MediaStreamTrackProcessor` with WebCodecs | Audio track to `AudioData`, then `copyTo(..., { format: 'f32-planar' })` | WebCodecs defines the float conversion ([WebCodecs](https://w3c.github.io/webcodecs/#dom-audiodata-copyto)). The current Media Capture Transform draft has no working-group consensus for audio tracks ([specification note](https://w3c.github.io/mediacapture-transform/#mediastreamtrackprocessor)). This is not a portable baseline. |
| `ScriptProcessorNode`                      | Audio graph to callback PCM arrays                                       | The Web Audio specification marks this interface as deprecated ([specification](https://www.w3.org/TR/webaudio-1.1/#ScriptProcessorNode)).                                                                                                                                                                                               |
| `MediaRecorder`                            | `MediaStream` to encoded `Blob` chunks                                   | The output is encoded media, not the required raw `Float32Array`. A decoder and extra buffering remain necessary.                                                                                                                                                                                                                        |

Sherpaw uses no third-party capture adapter. Its playground contains a local `AudioWorkletProcessor`. No library choice is necessary to reproduce that pipeline.

## Questions that remain open

- Does the package accept only PCM input, or does it also offer a `MediaStream` convenience function?
- Which layer owns channel downmixing?
- Which layer owns resampling when the requested `AudioContext` rate is unsupported?
- Must callers give `inputSampleRate`, or can an owned capture adapter derive it from `audioContext.sampleRate`?
- What buffering policy prevents renderer-to-main IPC from sending one small message for every render quantum?
