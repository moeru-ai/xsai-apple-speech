---
status: superseded by ADR-0004
---

# Keep transcription semantics platform-neutral

`@xsai-apple-speech/transcription` owns the public API, session semantics, transport contract, and xsAI Adapter. `transcription-native` implements the native transport and loads the Node-API binding. `transcription-electron-plugin` connects a renderer transport to the native transport through Eventa. This dependency direction keeps native modules out of renderer bundles and gives direct Node.js and Electron consumers the same transcription behavior.
