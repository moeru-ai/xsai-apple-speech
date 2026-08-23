---
status: accepted
---

# Return locale records from getLocales

The `getLocales` invoke returns one record for each supported Apple Speech locale.

```ts
interface AppleSpeechLocale {
  locale: string
  installed: boolean
}

type GetLocalesResult = AppleSpeechLocale[]
```

`locale` is a canonical BCP 47 identifier. `installed` reports whether the required locale assets are currently installed.

The result does not use separate supported and installed arrays. Consumers can display and filter each locale without a second membership lookup.
