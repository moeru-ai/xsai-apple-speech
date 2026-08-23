import { resolve } from 'node:path'
import { arch, env } from 'node:process'

import fakemic, { electron } from '@xsai-apple-speech/vitest-plugin-fakemic'
import { defineConfig } from 'vitest/config'

const exampleRoot = import.meta.dirname
const productExecutable = resolve(
  exampleRoot,
  'dist',
  arch === 'arm64' ? 'mac-arm64' : 'mac',
  'xsAI Apple Speech Example.app',
  'Contents',
  'MacOS',
  'xsAI Apple Speech Example',
)

export default defineConfig({
  test: {
    projects: [
      fakemic({
        include: ['tests/**/*.audio.test.ts'],
        name: 'electron-development',
        runtime: electron({
          cwd: exampleRoot,
          entry: resolve(exampleRoot, 'out/main/index.js'),
          name: 'electron-development',
          prepare: new URL('./tests/prepare-electron.ts', import.meta.url).href,
          temporaryUserData: {
            env: 'XSAI_APPLE_SPEECH_USER_DATA',
            prefix: 'xsai-apple-speech-development-',
          },
        }),
      }),
      fakemic({
        include: ['tests/**/*.audio.test.ts'],
        name: 'electron-packaged',
        runtime: electron({
          cwd: exampleRoot,
          executablePath: env.XSAI_APPLE_SPEECH_EXECUTABLE ?? productExecutable,
          name: 'electron-packaged',
          prepare: new URL('./tests/prepare-electron.ts', import.meta.url).href,
          temporaryUserData: {
            env: 'XSAI_APPLE_SPEECH_USER_DATA',
            prefix: 'xsai-apple-speech-packaged-',
          },
        }),
      }),
    ],
  },
})
