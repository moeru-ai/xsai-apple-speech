import { defineConfig } from 'bumpp'

export default defineConfig({
  all: true,
  commit: 'release: v%s',
  files: [
    'packages/transcription/package.json',
    'packages/transcription-electron-plugin/package.json',
    'packages/transcription-native/package.json',
    'packages/transcription-native/npm/darwin-arm64/package.json',
    'packages/transcription-native/npm/darwin-x64/package.json',
  ],
  push: false,
  sign: false,
})
