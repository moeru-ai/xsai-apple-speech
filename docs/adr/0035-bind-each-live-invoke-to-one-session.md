---
status: accepted
---

# Bind each live invoke to one session

Each accepted Electron `stream` invocation creates exactly one Transcription Session. The handler creates the session after it receives a valid start frame.

The Eventa invocation identifier is the protocol correlation key. It is not a public session identifier.

The protocol does not expose `createSession`, `attachSession`, or `sessionId`. A renderer cannot attach to a session from another invocation.

The returned live result is the renderer session handle. The request stream and response stream belong to that handle.

The request-stream end asks the session to finish. An invocation abort asks the same session to dispose.

The Electron plugin does not keep a second session registry. A host can wrap its injected Provider to observe or track live sessions.

An explicit session identifier can become necessary for reconnection, session transfer, or session recovery. The first release does not support these operations.
