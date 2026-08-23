---
status: accepted
---

# Use five automated verification layers

The repository uses five automated verification layers. Each layer exercises the smallest faithful interface for its target behavior.

Package unit tests cover locale logic, native loading, load coordination, session lifecycle, and stream semantics.

Eventa contract tests use real in-memory Eventa contexts and a fake Provider. They exercise all five invokes without an Electron process.

Native tests cover session startup, audio input, finish, abort, conversion, and resource cleanup.

Fakemic tests run the same Electron audio cases against development and packaged application builds.

The development project launches the electron-vite main output. The packaged project launches the electron-builder application executable through Playwright.

The packaged project exercises ASAR, native-addon unpacking, application metadata, and platform-package selection.

The release dry run inspects each npm package. It also installs the root native package in a clean project.

Vitest unit and Eventa contract tests do not start Electron. Only the Fakemic projects start a real Electron process.
