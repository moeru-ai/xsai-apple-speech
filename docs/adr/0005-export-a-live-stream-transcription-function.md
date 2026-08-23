---
status: accepted
---

# Export a live streamTranscription function

`@xsai-apple-speech/transcription` exports its own `streamTranscription` function for writable PCM input. The existing `@xsai/stream-transcription` function accepts a complete Blob and streams only the response. The shared function name follows sherpaw, while the package path identifies the different input contract.
