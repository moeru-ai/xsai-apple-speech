---
status: accepted
---

# Resample to the analyzer input format

Live transcription requires `inputSampleRate`. The value describes the actual rate of each input chunk in hertz.

This field does not promise support for every sample rate. The implementation can publish a smaller supported set when Apple or the converter requires it.

The Provider selects an internal format that is compatible with the active Apple Speech modules. This format can use a fixed sample rate.

`SpeechAnalyzer` does not resample its input. The owned transcription path resamples audio when the source and analyzer rates differ.

Each Transcription Session owns one persistent `AVAudioConverter` in the native package. The session bypasses conversion when Apple accepts the source format.

Web Audio can perform an optional early conversion in the Electron example. The native package still validates the declared format and keeps conversion support.

The resampler keeps state across input chunks. Closing the writable input flushes buffered output before the analyzer finishes.

The first release does not add MediaBunny. Its public API does not expose a suitable standalone live PCM resampler.

[The resampling research](../research/audio-resampling-options.md) compares Apple, Web Audio, and MediaBunny paths.
