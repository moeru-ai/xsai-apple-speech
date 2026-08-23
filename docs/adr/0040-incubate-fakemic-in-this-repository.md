---
status: accepted
---

# Incubate Fakemic in this repository

The first implementation copies the AIRI Fakemic module into xsai-apple-speech. The copy remains private test infrastructure.

The copy preserves the existing test interface, runtime behavior, and source attribution. It supports the Electron example without an external package release.

This approach lets the second consumer exercise the interface before publication. It also avoids a new release dependency during initial implementation.

The project will evaluate the copied module through real Electron example tests. Useful changes remain local until the interface becomes stable.

The project can extract and publish the module after AIRI and xsai-apple-speech prove the same interface.

This initial copy creates temporary duplication. Publication replaces both private implementations with one shared package.
