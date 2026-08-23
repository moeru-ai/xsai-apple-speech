---
status: accepted
---

# Use a complete Electron example structure

The Electron example covers the complete runtime and package path. It is not a renderer-only demonstration.

The example uses Electron, electron-vite, Vue, and TypeScript. It contains one window and one renderer page.

Its source has separate `main`, `preload`, `renderer`, and `shared` directories. This structure preserves each Electron seam.

The main process uses injeca to compose the Eventa context, native Provider, Electron setup, and BrowserWindow.

The preload uses `contextBridge` to expose limited IPC access. The renderer does not receive Node.js or native binding access.

The renderer creates its Eventa context from the exposed IPC interface. It then creates the Electron Provider.

The build supports the Vite development URL and packaged local files. The package uses electron-builder and keeps ASAR enabled.

The package unpacks native `.node` files from ASAR. It includes the native package for the current architecture.

The macOS package declares microphone and speech-recognition usage descriptions. It includes the required entitlements.

Application shutdown disposes the Electron setup before the Eventa context.

The example does not copy AIRI routing, Pinia stores, or multi-window product features.
