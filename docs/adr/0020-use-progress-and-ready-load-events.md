---
status: accepted
---

# Use progress and ready load events

The `load` invoke returns these progress values:

```ts
type AppleSpeechLoadProgress
  = {
    status: 'progress'
    locale: string
    progress: number
  }
  | {
    status: 'ready'
    locale: string
  }
```

The `progress` field uses the inclusive range from `0` to `100`. The native Provider converts `Progress.fractionCompleted` to this range.

The load operation emits one `ready` value before the response stream ends. An installed locale can emit `ready` without a preceding progress value.

The public `load` method passes every value to `onProgress`. Its promise resolves after the `ready` value and the response-stream end.
