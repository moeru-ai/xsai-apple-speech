---
status: accepted
---

# Require macOS 26 for transcription

The first release supports macOS 26.0 and later. It uses the Speech APIs that Apple introduced in macOS 26.

The build requires Xcode 26 and a macOS 26 SDK. The release workflow builds both arm64 and x64 addons with this SDK.

Package import and Provider construction do not load the `.node` file. The first Provider operation passes native load errors to the caller.

The first release does not fall back to `SFSpeechRecognizer`. A fallback would create a second transcription model with different output and lifecycle semantics.

The Provider still performs native framework and locale checks on macOS 26. The operating-system version alone does not guarantee availability.
