---
status: accepted
---

# Use one session for each transcription operation

The Provider scope owns availability, locale inventory, and locale loading. These operations do not create a Transcription Session.

Each `generate` operation creates one Transcription Session. The Provider hides its handle and disposes the session after completion, cancellation, or failure.

Each `stream` operation creates one Transcription Session. The returned live result is the session handle. It exposes input, result streams, completion promises, and `dispose()`.

Batch and live sessions use the same internal lifecycle model. Each session owns its analyzer, transcriber, audio converter, input state, result tasks, and pending callbacks.

Locale assets and the loaded Node binding do not belong to a session. Session disposal does not unload them.

A host can track exposed live sessions with its own session manager. The Provider does not require such a manager.
