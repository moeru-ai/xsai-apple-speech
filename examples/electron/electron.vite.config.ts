import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
      },
    },
    plugins: [vue(), UnoCSS()],
  },
})
