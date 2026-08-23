# macOS Electron CI feasibility

Date: 2026-08-22

This note evaluates GitHub-hosted CI for the native binding and the Electron example. It uses official GitHub, Playwright, and Apple sources.

## Conclusion

GitHub-hosted runners can build both Darwin packages on their matching architectures. The `macos-26` label selects arm64, and `macos-26-intel` selects x64.

Playwright can launch the unpacked executable inside a packaged Electron application. It can also pass the Fakemic Chromium arguments to that executable.

The main CI risk is Apple Speech asset installation. GitHub creates a new virtual machine for each job, and Apple manages locale assets as system resources.

Real transcription tests can run as an initial non-required job. Promote the job to a required check only after repeated CI runs show stable asset installation.

## macOS 26 runners

GitHub lists `macos-26` as an arm64 M1 runner. It lists `macos-26-intel` as an Intel runner. Both labels are generally available. [GitHub-hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) and [macOS 26 availability announcement](https://github.com/actions/runner-images/issues/13739)

The arm64 and Intel images currently contain Xcode 26.0.1 through Xcode 26.6. Xcode 26.6 is the default on both images. [arm64 image inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md#xcode) and [Intel image inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md#xcode)

The published VM storage size is 14 GB. The runner reference does not state the free space available after image provisioning.

Use explicit labels for the architecture matrix:

```yaml
strategy:
  matrix:
    include:
      - runner: macos-26
        architecture: arm64
      - runner: macos-26-intel
        architecture: x64
```

Do not use `macos-latest` for this matrix. That label can move to a different image.

## Packaged Electron launch

Playwright Electron accepts both `executablePath` and `args`. The API passes `args` to the application during launch. [Playwright Electron API](https://playwright.dev/docs/api/class-electron#electron-launch)

For a packaged macOS application, `executablePath` must identify the executable file:

```text
Example.app/Contents/MacOS/Example
```

This requirement follows from the launcher implementation. It uses `executablePath` as the child-process command. [Playwright Electron launcher](https://github.com/microsoft/playwright/blob/9642f57665db582b12dcfa5d8022808f2402fa2a/packages/playwright-core/src/server/electron/electron.ts#L180-L240)

For a configured `executablePath`, the launcher does not inject its development loader. The source states that packaged applications can have separate command-line handling.

Playwright adds its control arguments before the caller arguments. Thus, it transports the Fakemic arguments to the Electron executable.

Playwright does not define the behavior of Chromium fake-media arguments. A CI probe must make sure that the packaged Electron version accepts them.

The packaged application must keep the Electron `nodeCliInspect` fuse enabled. Playwright documents launch timeouts with a disabled fuse. [Playwright Electron known issues](https://playwright.dev/docs/api/class-electron#electron)

## GUI and microphone behavior

Playwright runs Electron in headful mode. Its Electron launcher sets the connected browser to `headful: true`. [Playwright Electron launcher](https://github.com/microsoft/playwright/blob/9642f57665db582b12dcfa5d8022808f2402fa2a/packages/playwright-core/src/server/electron/electron.ts#L294-L312)

The GitHub macOS image config contains a GUI launch domain and disables display sleep. This evidence supports GUI application launch, but it does not promise interactive permission handling. [macOS image configuration](https://github.com/actions/runner-images/blob/749514466b4f51b7dc8d9f1cda62257dcf13d183/images/macos/scripts/build/configure-machine.sh)

Playwright does not intercept native Electron dialogs. Tests must not depend on Playwright clicking a macOS permission alert. [Playwright Electron native-dialog note](https://playwright.dev/docs/api/class-electron#electron)

Apple requires explicit user permission for access to a real microphone. A packaged application also needs `NSMicrophoneUsageDescription` and the Audio Input entitlement. [Apple media authorization](https://developer.apple.com/documentation/avfoundation/requesting-authorization-to-capture-and-save-media)

Fakemic is intended to replace the physical microphone before `getUserMedia()` starts capture. The cited sources do not guarantee that this path bypasses macOS microphone authorization.

The first Electron CI job must record these values before it starts transcription:

- The result of `navigator.mediaDevices.enumerateDevices()`.
- The selected input-device label.
- The result or error from `getUserMedia()`.
- The macOS microphone authorization status that the application reads.

If a native permission alert appears, the hosted job is not deterministic. Use a self-hosted Mac with prepared permission state for that test.

## Speech permission and locale assets

Apple states that the speech-authorization flow applies to `SFSpeechRecognizer`. Apple also states that `SpeechAnalyzer` transcriber modules do not send voice audio to Apple servers. [Apple speech authorization](https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition)

This project must not call the legacy `SFSpeechRecognizer` authorization API. Microphone authorization remains a separate requirement for real audio capture.

`SpeechAnalyzer` needs assets for its configured modules. `AssetInventory` downloads these machine-learning models from Apple servers and lets the system manage them. [Apple AssetInventory](https://developer.apple.com/documentation/speech/assetinventory)

GitHub provisions a new virtual machine for each hosted job. Assets installed in one job are not available to a later job. [GitHub-hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

The macOS image inventories do not promise preinstalled Speech locale assets. Each real transcription job must call `load()` and wait for the selected locale.

An asset download can fail on its first attempt. Apple states that the system can continue the download after connectivity improves. [Apple asset download behavior](https://developer.apple.com/documentation/speech/assetinstallationrequest/downloadandinstall%28%29)

These rules create three CI constraints:

- The job needs outbound access to Apple asset servers.
- The job timeout must include a fresh locale download.
- The test cannot assume that an English asset is already present.

Do not copy system-managed asset files into a GitHub Actions cache. Apple states that applications do not work with these assets directly.

## Recommended CI boundary

Use required jobs for deterministic work:

- TypeScript type checks, lint, unit tests, and Eventa contract tests.
- Native arm64 and x64 builds on matching macOS 26 runners.
- Native addon loading without a transcription session.
- Electron development and packaged builds.
- Packaged `.node` resolution and Playwright application launch.

Start these jobs as non-required integration tests:

- Development Electron Fakemic with a real `SpeechAnalyzer` session.
- Packaged Electron Fakemic with a real `SpeechAnalyzer` session.

Run the real integration jobs on `macos-26` first. Add the Intel job after the arm64 path is stable.

Promote an integration job only after it shows stable results across fresh runners. If Apple asset installation remains unstable, use a prepared self-hosted Mac.

## Open checks

The official sources do not resolve these questions:

- Does the file-backed fake microphone avoid macOS TCC on GitHub-hosted macOS 26?
- Are any Speech locale assets present in a fresh runner image?
- How long does a fresh asset download take for each selected locale?
- Does Apple allow every required asset download from the hosted-runner network?
- How much disk space remains after dependencies, Xcode build output, the packaged application, and locale assets?

Answer these questions with a small probe workflow before the real transcription test becomes required.
