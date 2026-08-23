---
status: accepted
---

# Publish three separate packages

The repository publishes `@xsai-apple-speech/transcription`, `@xsai-apple-speech/transcription-native`, and `@xsai-apple-speech/transcription-electron-plugin`.

The `transcription` package owns the shared Provider contract and live transcription interface.

The `transcription-native` package owns native-addon loading and the native Provider Adapter.

The `transcription-electron-plugin` package owns the Eventa contract, Electron Plugin, and renderer Provider Adapter.

This split keeps native and Electron dependencies out of consumers that do not need them.
