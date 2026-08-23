---
status: accepted
---

# Require an exact canonical locale

The Provider accepts `locale` as a BCP 47 string. The shared contract converts the request and Apple locale identifiers to canonical BCP 47 form.

The Provider rejects malformed locale identifiers before it starts a Transcription Session. It compares the canonical request with Apple's current supported locale list.

The Provider requires an exact match. It does not replace a missing region, script, or language with a related locale.

An unsupported-locale error includes the requested locale and the supported canonical identifiers. Callers can also list supported and installed locales before transcription.

The AIRI prototype uses `SpeechTranscriber.supportedLocale(equivalentTo:)`. The new Provider does not use this convenience because it can select a different locale.
