---
status: accepted
---

# Separate deterministic and real transcription CI

Pull requests require deterministic verification.

The required checks cover these paths:

- Lint, type checks, unit tests, and Eventa contract tests.
- Native arm64 and x64 builds on explicit macOS 26 runner labels.
- Native Swift tests for both architectures.
- Electron development and packaged builds.
- ASAR contents and native-addon unpacking.

Real `SpeechAnalyzer` tests start as non-required integration checks. Fakemic tests the development and packaged Electron builds on arm64.

Each real test calls `load()` for its selected locale. It does not assume that the runner has the required locale asset.

The test records microphone discovery, device selection, capture results, permission status, load progress, transcription results, and errors.

The project adds an Intel real-transcription job after the arm64 job is stable.

A real-transcription job becomes required after repeated runs succeed on fresh hosted runners.

If permissions or locale assets remain unstable, the real-transcription tests move to a prepared self-hosted Mac.
