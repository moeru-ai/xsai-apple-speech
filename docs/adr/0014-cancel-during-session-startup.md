---
status: accepted
---

# Cancel during session startup

The TypeScript layer allocates an internal session identity before asynchronous startup begins. The public result can call `dispose()` immediately.

Locale asset download, native startup, and the Eventa request use the same session cancellation scope. Cancellation also stops pending input reads.

`dispose()` waits for startup tasks to stop. It then releases all native and IPC resources that those tasks created.

Every startup completion checks the session identity and current state. A stale completion cannot register or publish a native session.

If a canceled task creates a resource late, that task releases the resource immediately. The disposed result cannot become active again.

The same Provider can create a new Transcription Session after this cancellation. The new session receives a different internal identity.
