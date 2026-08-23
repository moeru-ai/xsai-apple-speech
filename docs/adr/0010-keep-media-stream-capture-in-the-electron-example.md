---
status: accepted
---

# Keep MediaStream capture in the Electron example

The public Provider accepts normalized mono PCM through `WritableStream<Float32Array>`. It does not accept a browser `MediaStream`.

The first Electron example owns microphone capture and the `MediaStream`-to-PCM adapter. The adapter uses Web Audio and feeds PCM chunks into the Provider.

This boundary keeps DOM capture APIs outside the shared transcription package. It also lets the example verify permissions, resampling, backpressure, and cleanup.

The Electron plugin does not export the adapter in the first release. We can move the adapter after its contract is stable and reused.
