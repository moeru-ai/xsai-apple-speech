---
status: accepted
---

# Distinguish completion from disposal

Closing `live.input` requests graceful completion. The session stops accepting audio and flushes its `AVAudioConverter`.

The session then ends the analyzer input and finalizes through the end of that input. It waits for the Apple result task to finish.

A successful session emits one `transcript.text.done` event. It closes both readable streams and resolves `text` and `done`.

The completion path releases native and IPC resources before `done` resolves. A later `dispose()` call has no effect.

Calling `dispose()` before completion cancels the session. The session stops input, conversion, Apple analysis, result handling, and IPC work.

Cancellation does not emit `transcript.text.done`. The readable streams error, and the unresolved `text` and `done` promises reject with `AbortError`.

`dispose()` is idempotent. Concurrent calls share the same cleanup operation.
