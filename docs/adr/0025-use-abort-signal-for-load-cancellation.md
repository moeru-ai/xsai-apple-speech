---
status: accepted
---

# Use abortSignal for load cancellation

The public `load` options contain an optional `abortSignal` field.

```ts
interface LoadAppleSpeechOptions {
  locale: string
  abortSignal?: AbortSignal
  onProgress?: (progress: AppleSpeechLoadProgress) => Promise<void> | void
}
```

This name matches the xsAI request options. It also keeps the Provider contract independent from Eventa.

If the signal is already aborted, `load` rejects before it starts a native operation. A later abort cancels that operation.

The Electron Provider passes `abortSignal` as the Eventa invocation `signal`. The signal is an invocation option and is not part of the payload.

The Provider removes its abort listener after the load operation settles. Automatic loads use the cancellation signal of their owning transcription operation.
