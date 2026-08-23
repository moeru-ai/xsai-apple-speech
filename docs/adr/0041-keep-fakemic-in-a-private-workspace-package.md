---
status: accepted
---

# Keep Fakemic in a private workspace package

The copied Fakemic module lives at `packages/vitest-plugin-fakemic`.

Its package name is `@xsai-apple-speech/vitest-plugin-fakemic`. Its package metadata contains `private: true`.

The Electron example uses it as a workspace development dependency. The package keeps its own dependencies, type check, and unit tests.

This structure preserves the existing Fakemic package interface. A later extraction does not need to separate the module from root test files.

The private package does not enter the npm release matrix. The repository still publishes only the three product packages.
