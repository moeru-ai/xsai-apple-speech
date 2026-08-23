---
status: accepted
---

# Use a writable Float32 audio stream

The live result exposes `input` as `WritableStream<Float32Array>`, which matches sherpaw's transcription input and the sample arrays produced by Web Audio. Each array contains normalized mono samples in the range `[-1, 1]`. Native sample encoding stays private. A caller can use `getWriter()` or pipe a `ReadableStream<Float32Array>` into `input`.

A browser `MediaStream` cannot pipe into this input. It contains media tracks and does not implement the Web Streams interface. A separate capture adapter must use Web Audio or another PCM extraction API to produce the required arrays.
