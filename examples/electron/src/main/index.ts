import { dirname, join } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { setupAppleSpeechTranscription } from '@xsai-apple-speech/transcription-electron-plugin/main'
import { createAppleSpeechProvider } from '@xsai-apple-speech/transcription-native'
import { app, BrowserWindow, ipcMain } from 'electron'
import { injeca, lifecycle } from 'injeca'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

/** Creates the single example window and loads its development or packaged page. */
async function createExampleWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    height: 900,
    minHeight: 720,
    minWidth: 760,
    show: false,
    title: 'xsAI Apple Speech Example',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(currentDirectory, '../preload/index.mjs'),
      sandbox: false,
    },
    width: 1120,
  })
  window.once('ready-to-show', () => window.show())

  if (env.ELECTRON_RENDERER_URL)
    await window.loadURL(env.ELECTRON_RENDERER_URL)
  else
    await window.loadFile(join(currentDirectory, '../renderer/index.html'))

  return window
}

/**
 * Composes and starts the example's Electron runtime.
 *
 * Call stack:
 *
 * startApplication
 *   -> {@link injeca.start}
 *     -> setupAppleSpeechTranscription
 *       -> {@link createExampleWindow}
 */
async function startApplication(): Promise<void> {
  const testUserDataPath = env.XSAI_APPLE_SPEECH_USER_DATA
  if (testUserDataPath)
    app.setPath('userData', testUserDataPath)

  const electronApp = injeca.provide('host:electron-app', () => app)
  const readyApp = injeca.provide('host:ready-electron-app', {
    dependsOn: { app: electronApp },
    async build({ dependsOn }) {
      await dependsOn.app.whenReady()
      return dependsOn.app
    },
  })
  const eventa = injeca.provide('transport:eventa', {
    dependsOn: { app: readyApp },
    build() {
      return createContext(ipcMain)
    },
  })
  const provider = injeca.provide('speech:provider', () => createAppleSpeechProvider())
  const speechSetup = injeca.provide('speech:electron-setup', {
    dependsOn: { eventa, provider },
    build({ dependsOn }) {
      return setupAppleSpeechTranscription({
        context: dependsOn.eventa.context,
        provider: dependsOn.provider,
      })
    },
  })
  const exampleWindow = injeca.provide('window:example', {
    dependsOn: { app: readyApp, eventa, lifecycle, setup: speechSetup },
    async build({ dependsOn }) {
      const window = await createExampleWindow()

      // One stop hook owns the cross-module cleanup order. Closing the window
      // ends new renderer work before the setup removes handlers and the Eventa
      // context aborts any remaining transport work.
      dependsOn.lifecycle.appHooks.onStop(async () => {
        if (!window.isDestroyed())
          window.destroy()
        await dependsOn.setup.dispose()
        dependsOn.eventa.dispose()
      })
      return window
    },
  })

  injeca.invoke({
    dependsOn: { window: exampleWindow },
    callback: () => {},
  })

  await injeca.start()
}

let isStopping = false
app.on('before-quit', (event) => {
  if (isStopping)
    return
  event.preventDefault()
  isStopping = true
  void injeca.stop().finally(() => app.quit())
})

void startApplication().catch((error) => {
  console.error(error)
  app.exit(1)
})
