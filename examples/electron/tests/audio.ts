import type { AudioTestCase, AudioTestTask } from '@xsai-apple-speech/vitest-plugin-fakemic'
import type { Page } from 'playwright'

import type { ExampleElectronSession } from './prepare-electron'

import { fileURLToPath } from 'node:url'

import {
  createAudioTestAPI,
  createAudioTestTask,
  runAudioTestSession,
  startFakemicRuntime,
} from '@xsai-apple-speech/vitest-plugin-fakemic'

export const audio = createAudioTestAPI<
  AudioTestCase<Page>,
  AudioTestTask,
  { page: Page },
  Page
>({
  createPlans(name, definition) {
    const task = createAudioTestTask(name, definition)
    return [{
      definition: task,
      metadata: {
        input: fileURLToPath(task.input),
        runtime: 'electron',
      },
      name,
    }]
  },
  async execute({ invokeHandler, plan, runPreflight, task }) {
    await runAudioTestSession({
      async execute(session) {
        Object.assign(task.context, { page: session.page })
        await runPreflight(session.page)
        await invokeHandler()
      },
      start: () => startFakemicRuntime<ExampleElectronSession>(
        fileURLToPath(plan.definition.input),
      ),
    })
  },
  preflight: definition => definition.preflight,
})
