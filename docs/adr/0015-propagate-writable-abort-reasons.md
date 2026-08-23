---
status: accepted
---

# Propagate writable abort reasons

`writer.abort(reason)` uses the same cancellation and cleanup operation as `dispose()`. Its returned promise settles after that cleanup.

If the caller supplies a reason, the readable streams error with that value. The unresolved `text` and `done` promises reject with it.

If the caller omits the reason, the result uses `AbortError`. A direct `dispose()` call also uses `AbortError`.

An aborted session does not emit `transcript.text.done`. Native and IPC cleanup remain idempotent.
