---
status: accepted
---

# Isolate concurrent transcription sessions

One Provider supports multiple concurrent Transcription Sessions. Each `streamTranscription` result owns one session, and its idempotent `dispose` affects only that session. The Provider has no global `dispose`. The Electron plugin closes all sessions owned by a renderer when that renderer closes.
