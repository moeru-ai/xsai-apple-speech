# AIRI Fakemic research

## Result

AIRI has a reusable fake-microphone test module at `packages/vitest-plugin-fakemic`.

The module starts a real Chromium or Electron process through Playwright. It adds these Chromium arguments:

```text
--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream
--use-file-for-fake-audio-capture=<fixture>%noloop
--autoplay-policy=no-user-gesture-required
```

The file-backed microphone appears through `navigator.mediaDevices`. Application code continues to call `enumerateDevices` and `getUserMedia`.

This behavior can exercise the Electron example through its normal microphone seam. The test does not need a direct PCM fixture path.

## Test interface

The package exports these main operations:

- `fakemic` creates a serial Vitest project with a custom runner.
- `electron` and `web` define runtime descriptors.
- `createAudioTestAPI` creates application-owned audio test functions.
- `startFakemicRuntime` launches one runtime for one audio fixture.
- `runAudioTestSession` preserves errors from execution, artifacts, and cleanup.

Each audio case supplies a WAV file and optional preflight callbacks. A prepare module converts the Playwright runtime into an application-specific test session.

The Electron runtime can use a temporary user-data directory. The session cleanup closes Electron and removes this directory.

These cases do not use Vitest Browser Mode. Each case needs a different Chromium process argument for its microphone fixture.

## AIRI usage

`packages/testing-audio` configures separate Web, Electron, and unit-test projects.

Its Electron prepare module waits for the renderer window and returns Playwright page operations. A preflight callback finds the device with `Fake` in its label.

The tests then select that device and start the normal microphone flow. Existing cases record streaming transcript updates and final transcripts.

## Reuse constraint

`@proj-airi/vitest-plugin-fakemic` has `private: true` and a workspace version. The package is not a direct dependency option for an independent repository.

The reusable module can move to a published package. Another option is to copy a local test-only implementation into the new repository.

A published package keeps one implementation for AIRI and xsai-apple-speech. A local copy avoids release coordination but creates two implementations.

## Relevant source files

- `/Users/neko/Git/github.com/moeru-ai/airi/packages/vitest-plugin-fakemic/src/index.ts`
- `/Users/neko/Git/github.com/moeru-ai/airi/packages/vitest-plugin-fakemic/src/runner.ts`
- `/Users/neko/Git/github.com/moeru-ai/airi/packages/testing-audio/vitest.config.ts`
- `/Users/neko/Git/github.com/moeru-ai/airi/packages/testing-audio/src/describe.ts`
- `/Users/neko/Git/github.com/moeru-ai/airi/packages/testing-audio/src/runtimes/prepare-electron.ts`
