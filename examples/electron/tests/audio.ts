import type { AudioTestCase, AudioTestTask } from '@xsai-apple-speech/vitest-plugin-fakemic'
import type { Page } from 'playwright'

import type { ExampleElectronSession } from './prepare-electron'

import { fileURLToPath } from 'node:url'

import { createAudioTestAPI, createAudioTestTask, runAudioTestSession, startFakemicRuntime } from '@xsai-apple-speech/vitest-plugin-fakemic'

export const audio = createAudioTestAPI<AudioTestCase<Page>, AudioTestTask, { page: Page }, Page>({
  createPlans(name, definition) {
    const task = createAudioTestTask(name, definition)

    return [{
      definition: task,
      metadata: { input: fileURLToPath(task.input), runtime: 'electron' },
      name,
    }]
  },
  async execute(ctx) {
    await runAudioTestSession({
      async execute(session) {
        Object.assign(ctx.task.context, { page: session.page })

        await ctx.runPreflight(session.page)
        await ctx.invokeHandler()
      },
      start: () => startFakemicRuntime<ExampleElectronSession>(fileURLToPath(ctx.plan.definition.input)),
    })
  },
  preflight: (definition) => {
    return definition.preflight
  },
})
