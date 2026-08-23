---
status: superseded
superseded-by: 0019
---

# Use four Electron invokes and a setup resource

ADR 0019 supersedes this decision because the contract now includes a `load` invoke.

The Electron Eventa contract exposes four invokes:

- `isAvailable` returns `{ available, reason? }` for Apple Speech.
- `getLocales` returns the locale inventory.
- `generate` transcribes one encoded audio input.
- `stream` transcribes a live PCM input stream.

Availability and locale inventory are separate queries. A caller can read availability without loading the locale inventory.

The main entrypoint exports `setupAppleSpeechTranscription`. It accepts an existing global Eventa context and the native Provider.

The setup returns an object with an idempotent asynchronous `dispose()` method. This method removes the four handlers and cancels unfinished sessions.

```ts
interface AppleSpeechTranscriptionSetup {
  dispose: () => Promise<void>
}
```

The setup does not dispose the injected Eventa context. The owner of that context disposes it after the Apple Speech setup.

AIRI uses injeca to own the setup resource and call its `dispose()` method. The Electron example uses the same lifecycle model.
