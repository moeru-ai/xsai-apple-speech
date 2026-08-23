---
status: accepted
---

# Publish separate Darwin architecture packages

The native Provider uses one root package and two platform packages:

```text
@xsai-apple-speech/transcription-native
@xsai-apple-speech/transcription-native-darwin-arm64
@xsai-apple-speech/transcription-native-darwin-x64
```

The root package contains the TypeScript Provider and a private native package import. It does not contain a native binary.

The root package lists both platform packages in `optionalDependencies`. All three packages use the same version.

Each platform package contains one `.node` file. Its manifest uses `os: ["darwin"]` and the matching `cpu` value.

The release workflow builds and stages the arm64 and x64 artifacts separately. It publishes no universal binary in the first release.

The Provider selects the package from `process.arch`. It does not search for a binary from another architecture.

This topology follows the AUV root-package and platform-package pattern. The project implements its own staging and loading scripts.
