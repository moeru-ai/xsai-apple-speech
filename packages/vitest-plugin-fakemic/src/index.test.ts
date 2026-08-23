import {
  createAudioTestAPI,
  createAudioTestTask,
  electron,
  runAudioTestSession,
} from '@xsai-apple-speech/vitest-plugin-fakemic'
import { describe, expect, it, vi } from 'vitest'

const calls: string[] = []
const audio = createAudioTestAPI<
  { value: string, preflight?: readonly ((context: { value: string }) => void)[] },
  { value: string },
  { capturedValue: string },
  { value: string }
>({
  createPlans: (name, definition) => [{
    definition,
    metadata: { input: '/fixtures/input.wav', runtime: 'mock' },
    name: `mock: ${name}`,
  }],
  preflight: definition => definition.preflight,
  async execute({ plan, task, invokeHandler, runPreflight }) {
    await runPreflight({ value: 'preflight' })
    Object.assign(task.context, { capturedValue: plan.definition.value })
    await invokeHandler()
  },
})

audio.describe('createAudioTestAPI', () => {
  audio.it('runs preflight before a registered task', {
    preflight: [({ value }) => calls.push(value)],
    value: 'captured',
  }, ({ capturedValue }) => {
    expect(calls).toEqual(['preflight'])
    expect(capturedValue).toBe('captured')
  })
})

describe('audio test tasks', () => {
  it('describes a packaged Electron executable', () => {
    expect(electron({
      executablePath: '/Applications/Example.app/Contents/MacOS/Example',
      name: 'packaged',
      prepare: 'file:///prepare.ts',
    })).toMatchObject({
      executablePath: '/Applications/Example.app/Contents/MacOS/Example',
      kind: 'electron',
    })
  })

  it('creates one task for the current runtime project', () => {
    const input = new URL('file:///audio/input.wav')
    expect(createAudioTestTask('captures speech', { input })).toEqual({
      input,
      name: 'captures speech',
    })
  })

  it('records artifacts before it closes the session', async () => {
    const order: string[] = []
    const session = {
      close: vi.fn(async () => {
        order.push('close')
      }),
    }

    await runAudioTestSession({
      execute: async () => { order.push('execute') },
      recordArtifacts: async () => { order.push('record') },
      start: async () => session,
    })

    expect(order).toEqual(['execute', 'record', 'close'])
  })

  it('keeps execution and cleanup failures', async () => {
    const executionError = new Error('execution failed')
    const closeError = new Error('close failed')

    await expect(runAudioTestSession({
      execute: async () => { throw executionError },
      start: async () => ({ close: async () => { throw closeError } }),
    })).rejects.toMatchObject({ errors: [executionError, closeError] })
  })
})
