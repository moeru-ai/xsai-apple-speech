---
status: accepted
---

# Separate deterministic and real transcription CI

Pull requests require deterministic verification and a real Fakemic integration check.

The required checks cover these paths:

- Lint, type checks, unit tests, and Eventa contract tests.
- Native arm64 and x64 builds on explicit macOS 26 runner labels.
- Native Swift tests for both architectures.
- Electron development and packaged builds.
- ASAR contents and native-addon unpacking.
- Electron Fakemic transcription on arm64.

Fakemic is a required integration check. It exercises the development Electron build with a real `SpeechAnalyzer` session on arm64.

Each real test calls `load()` for its selected locale. It does not assume that the runner has the required locale asset.

The test records microphone discovery, device selection, capture results, permission status, load progress, transcription results, and errors.

The project adds an Intel Fakemic job after the arm64 job is stable.

If permissions or locale assets become unstable, the required Fakemic test moves to a prepared self-hosted Mac.
