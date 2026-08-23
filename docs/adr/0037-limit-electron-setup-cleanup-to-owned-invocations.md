---
status: accepted
---

# Limit Electron setup cleanup to owned invocations

The Electron setup owns its five handler registrations. It also owns a cleanup record for each invocation that enters through these handlers.

The setup does not own a second registry of Transcription Sessions. The Provider remains the source of session behavior.

`dispose()` first removes all five handlers. This order prevents a new invocation from entering during cleanup.

The disposer then aborts every active invocation from this setup. It waits for their stream, load, and native cleanup.

A canceled load invocation cancels its native operation. Other load invocations continue independently.

The disposer is asynchronous and idempotent. Concurrent calls await the same cleanup result.

The setup does not dispose the injected Provider or Eventa context. It does not unload the native binding or clear Provider locale state.

Provider operations that did not enter through this setup continue without interruption.
