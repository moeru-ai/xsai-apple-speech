---
status: accepted
---

# Use Provider as the public abstraction

All consumers use an Apple Speech Provider. `transcription-native` creates a Provider backed by the native binding. `transcription-electron-plugin` creates a Provider backed by Eventa. `transcription` owns the shared Provider contract and transcription functions. The public API has no Runtime or Transport abstraction because these concepts expose implementation structure without helping the caller.
