# `@xsai-apple-speech/transcription-electron-plugin`

This package projects an Apple Speech Provider across Electron IPC with Eventa. It owns five invokes: availability, locales, locale loading, batch generation, and live streaming.

Register the handlers once in the main process:

```ts
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { setupAppleSpeechTranscription } from '@xsai-apple-speech/transcription-electron-plugin/main'
import { createAppleSpeechProvider } from '@xsai-apple-speech/transcription-native'
import { ipcMain } from 'electron'

const eventa = createContext(ipcMain)
const setup = setupAppleSpeechTranscription({
  context: eventa.context,
  provider: createAppleSpeechProvider(),
})
```

Create a renderer Provider from the renderer Eventa context:

```ts
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { createAppleSpeechProvider } from '@xsai-apple-speech/transcription-electron-plugin'

const eventa = createContext(window.example.ipcRenderer)
const provider = createAppleSpeechProvider({ context: eventa.context })
```

The host owns the injected Provider and both Eventa contexts. On shutdown, dispose the plugin setup before the main Eventa context. The setup removes its handlers, aborts active invocations, and waits for their cleanup. It does not dispose the Provider or context.

The Eventa contract carries the transcriber, grouped overrides, analysis context, and native result metadata. All payloads remain structured-clone compatible.

The renderer Provider uses automatic selection by default. Explicit `speech` and `dictation` options use the same interface as the native Provider.

Do not expose Electron's full `ipcRenderer` through `contextBridge`. The example exposes only the `send`, `on`, and `removeListener` operations that the Eventa adapter uses.
