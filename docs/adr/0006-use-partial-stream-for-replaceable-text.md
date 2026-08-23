---
status: accepted
---

# Use partialStream for replaceable text

The live result exposes `partialStream` for the current complete but unfinished transcript. Each value replaces the previous value. Consumers must not append these values. We rejected `chunkStream` because chunk implies an append-only fragment.
