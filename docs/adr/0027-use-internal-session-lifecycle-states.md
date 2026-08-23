---
status: accepted
---

# Use internal session lifecycle states

The transcription implementation uses these internal session states:

```ts
type TranscriptionSessionState
  = 'starting'
    | 'active'
    | 'finishing'
    | 'disposing'
    | 'completed'
    | 'failed'
    | 'disposed'
```

The main transitions are:

```text
starting -> active -> finishing -> completed
    |          |          |
    +----------+----------+-> failed

starting | active | finishing
    -> disposing
    -> disposed
```

`starting` includes locale loading, native resource creation, and Eventa startup. `active` means that the native session is ready to process audio.

`finishing` starts after a graceful input close. It includes converter flush, analyzer finalization, the done event, and resource cleanup.

`disposing` starts after cancellation. It includes native cancellation, stream rejection, and resource cleanup.

`completed`, `failed`, and `disposed` are terminal states. Each terminal state means that the implementation released its owned resources.

Calling `dispose()` after a terminal state has no effect. A stale startup completion cannot change a terminal state.

These states are implementation details. The public result does not expose a `state` field.

The model does not use `idle`, `loading`, or `ready`. Those names do not identify the complete session lifecycle precisely.
