---
status: accepted
---

# Exercise all Provider operations in the Electron example

The Electron example exposes all five Provider operations through one renderer page. The page has three test areas.

The Capability and Locale area calls `isAvailable` and `getLocales`. It displays structured unavailability reasons and exact locale identifiers.

This area also calls `load`, displays progress through `ready`, and cancels one load operation.

The Batch Transcription area accepts a local audio file. It calls xsAI `generateTranscription` and displays the result or error.

This area also supports abort. The abort path cancels the hidden batch Transcription Session.

The Live Transcription area captures a microphone with `getUserMedia`. An `AudioWorklet` sends mono `Float32Array` chunks and the actual sample rate.

The page replaces its current Partial Transcript for each `partialStream` value. It also displays the ordered `fullStream` events.

The Stop action closes the writable input and waits for graceful completion. The Cancel action calls `dispose()` and waits for cleanup.

After either path settles, the page can start another Transcription Session.

The page displays microphone permission, current operation state, and the most recent error. It does not add a business state module.
