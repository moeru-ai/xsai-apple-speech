import { resolve } from 'node:path'

import fakemic, { electron } from '@xsai-apple-speech/vitest-plugin-fakemic'

import { defineConfig } from 'vitest/config'

const exampleRoot = import.meta.dirname

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
    ],
  },
})
