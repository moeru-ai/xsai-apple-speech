---
status: accepted
supersedes: 0017
---

# Add a load invoke with progress

The Electron Eventa contract exposes five invokes:

- `isAvailable` returns `{ available, reason? }`.
- `getLocales` returns the locale inventory.
- `load` installs the assets for one locale and reports progress.
- `generate` transcribes one encoded audio input.
- `stream` transcribes a live PCM input stream.

The `load` invoke is a server-streaming invoke. Its request contains a canonical BCP 47 locale identifier.

The response stream reports progress from the Apple `AssetInstallationRequest`. A normal stream end means that the locale is ready.

The shared Provider exposes `load` with an optional progress callback. The Electron Provider projects the Eventa response stream into this callback.

This design follows the load pattern in xsai-transformers. Its public load method reports Eventa stream values through `onProgress`.

The main entrypoint exports `setupAppleSpeechTranscription`. It accepts an existing global Eventa context and the native Provider.

The setup returns an object with an idempotent asynchronous `dispose()` method. This method removes the five handlers and cancels unfinished work.

The setup does not dispose the injected Eventa context. AIRI uses injeca to own the setup resource and its lifecycle.
