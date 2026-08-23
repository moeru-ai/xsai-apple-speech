# Vitest plugin for fake microphones

This private workspace package starts Web or Electron runtimes with a file-backed Chromium microphone. It also connects those runtimes to serial Vitest projects.

The initial implementation was copied from `moeru-ai/airi/packages/vitest-plugin-fakemic` at revision `86a13077ea6392f62ba3824e18f61852769a92b1`. AIRI and this repository use the MIT License. The package name changed, but its public test interface and runtime behavior remain the same.

Use it when an application test must follow the normal `getUserMedia()` path. Do not use it for Provider unit tests or Eventa contract tests; those tests do not need a browser or Electron process.

```ts
import fakemic, { electron } from '@xsai-apple-speech/vitest-plugin-fakemic'

export default fakemic({
  name: 'electron-development',
  include: ['tests/**/*.audio.test.ts'],
  runtime: electron({
    name: 'electron-development',
    prepare: new URL('./prepare-electron.ts', import.meta.url).href,
    entry: 'out/main/index.js',
  }),
})
```

The package is private. It is not part of the npm release set.
