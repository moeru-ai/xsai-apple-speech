---
status: accepted
---

# Load the architecture package directly

The native Provider uses `createRequire(import.meta.url)` from `node:module`. It does not add a separate loader module.

The Provider forms the package name from `process.arch`:

```text
darwin-arm64
  -> @xsai-apple-speech/transcription-native-darwin-arm64

darwin-x64
  -> @xsai-apple-speech/transcription-native-darwin-x64
```

The Provider requires the selected package by its package name. Each package points its `main` field directly to its `.node` file.

The Provider does not search build directories or a root-package `prebuilds` directory.

Node.js throws the original error when the package or native addon cannot load. The Provider does not convert this error.
