import type { Page } from 'playwright'

import { expect } from 'vitest'

import { audio } from './audio'

const input = new URL('./fixtures/hello.wav', import.meta.url)

async function readDiagnostics(page: Page, phase: string): Promise<Record<string, unknown>> {
  const devices = await page.evaluate(async () => {
    const discovered = await navigator.mediaDevices.enumerateDevices()
    return discovered.map(device => ({
      deviceId: device.deviceId,
      kind: device.kind,
      label: device.label,
    }))
  })
  const readOptionalText = async (testId: string): Promise<string> => {
    const locator = page.getByTestId(testId)
    return await locator.count() === 0 ? '' : (await locator.textContent())?.trim() ?? ''
  }

  return {
    devices,
    error: await readOptionalText('live-error'),
    loadProgress: await readOptionalText('load-progress'),
    loadStatus: await readOptionalText('capability-status'),
    microphonePermission: await readOptionalText('microphone-permission'),
    partialTranscript: await readOptionalText('partial-transcript'),
    phase,
    sampleRate: await readOptionalText('microphone-sample-rate'),
    status: await readOptionalText('live-status'),
  }
}

function recordDiagnostics(diagnostics: Record<string, unknown>): void {
  process.stdout.write(`[fakemic] ${JSON.stringify(diagnostics)}\n`)
}

async function loadSelectedLocale(page: Page): Promise<void> {
  await expect.poll(() => page.getByTestId('capability-status').textContent())
    .toMatch(/languages are available\.$/)
  recordDiagnostics(await readDiagnostics(page, 'before-load'))
  await page.getByRole('button', { name: 'Prepare language' }).click()
  await expect.poll(
    () => page.getByTestId('capability-status').textContent(),
    { timeout: 120_000 },
  ).toMatch(/is ready to use\.$/)
  recordDiagnostics(await readDiagnostics(page, 'after-load'))
}

async function readTranscriptResult(page: Page): Promise<string> {
  const current = page.getByTestId('transcript-current')
  if (await current.count() > 0)
    return (await current.textContent())?.trim() ?? ''

  const segment = page.getByTestId('transcript-segment-text').first()
  return await segment.count() > 0 ? (await segment.textContent())?.trim() ?? '' : ''
}

async function runWithDiagnostics(page: Page, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  }
  catch (error) {
    recordDiagnostics({
      ...await readDiagnostics(page, 'error'),
      thrownError: error instanceof Error ? error.stack ?? error.message : String(error),
    })
    throw error
  }
}

audio.describe('Electron microphone path', () => {
  audio.it('reloads languages after the user selects Dictation', { input }, async ({ page }) => {
    await runWithDiagnostics(page, async () => {
      await expect.poll(() => page.getByTestId('capability-status').textContent())
        .toMatch(/languages are available\.$/)

      const dictation = page.getByTestId('transcriber-select').getByRole('radio', { name: 'Dictation' })
      await dictation.click()

      await expect.poll(() => dictation.isChecked()).toBe(true)
      await expect.poll(() => page.getByTestId('capability-status').textContent())
        .toMatch(/languages are available\.$/)
      await expect.poll(() => page.getByTestId('locale-select').getByRole('combobox').isEnabled()).toBe(true)
      expect(await page.getByText('Use DictationTranscriber and its dictation options.').count()).toBe(1)
    })
  })

  audio.it('streams a file-backed microphone and finishes gracefully', { input }, async ({ page }) => {
    await runWithDiagnostics(page, async () => {
      await loadSelectedLocale(page)
      await page.getByTestId('live-start').click()
      await expect.poll(() => page.getByTestId('live-status').textContent()).toBe('Listening')
      recordDiagnostics(await readDiagnostics(page, 'capturing'))
      await expect.poll(
        () => readTranscriptResult(page),
        { timeout: 120_000 },
      ).not.toBe('')

      await page.getByRole('button', { name: 'Finish' }).click()
      await expect.poll(
        () => page.getByTestId('live-status').textContent(),
        { timeout: 120_000 },
      ).toBe('Transcript complete')
      await expect.poll(() => page.getByTestId('transcript-segment').count()).toBeGreaterThan(0)
      expect((await page.getByTestId('transcript-segment-text').first().textContent())?.trim()).not.toBe('')
      recordDiagnostics(await readDiagnostics(page, 'complete'))
    })
  })

  audio.it('cancels one live session and can start again', { input }, async ({ page }) => {
    await runWithDiagnostics(page, async () => {
      await loadSelectedLocale(page)
      await page.getByTestId('live-start').click()
      await expect.poll(() => page.getByTestId('live-status').textContent()).toBe('Listening')
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect.poll(() => page.getByTestId('live-status').textContent()).toBe('Session canceled')
      expect(await page.getByTestId('live-start').isEnabled()).toBe(true)
      recordDiagnostics(await readDiagnostics(page, 'canceled'))
    })
  })
})
