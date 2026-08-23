---
status: accepted
---

# Rewrite the AIRI integration after the prerelease

The independent repository reaches an installable prerelease before AIRI adopts it.

Pull request 2262 remains the integration and acceptance baseline. Its implementation is rewritten to consume the prerelease packages.

The rewrite removes these parts from AIRI:

- The embedded native package and build scripts.
- The local native-addon loader.
- Apple Speech Eventa contracts owned by the Electron Plugin.
- The local Electron main-process handlers.
- The local renderer Apple Speech Provider Adapter.

AIRI keeps its application-specific integration:

- injeca composition for the native Provider and Electron Plugin.
- Provider registry metadata and automatic local configuration.
- Settings UI and locale selection.
- Microphone capture, VAD, and the hearing pipeline.
- AIRI integration tests and user-visible verification.

The rewrite does not merge the embedded prototype first. This order prevents AIRI from owning a second implementation during extraction.
