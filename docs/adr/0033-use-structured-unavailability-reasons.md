---
status: accepted
---

# Use structured unavailability reasons

`isAvailable()` returns a discriminated availability result:

```ts
type AppleSpeechAvailability
  = | { available: true }
    | {
      available: false
      reason: AppleSpeechUnavailableReason
    }
```

An unavailable result always contains a structured-clone-safe reason:

```ts
type AppleSpeechUnavailableCode
  = 'framework-unavailable'

interface AppleSpeechUnavailableReason {
  code: AppleSpeechUnavailableCode
  message: string
}
```

`load`, `generate`, and `stream` throw `AppleSpeechUnavailableError` when the native framework is unavailable. This class extends `XSAIError`.

The error uses `apple_speech_unavailable` as its xsAI error code. Its `reason` field contains the same reason that `isAvailable()` returns.

The Electron protocol transmits the reason and reconstructs `AppleSpeechUnavailableError` in the renderer.

Native package errors do not use this result. The native Provider passes these errors to the caller without a wrapper.

Locale errors and operation errors are separate decisions. They do not use an unavailability code unless the complete Provider is unavailable.
