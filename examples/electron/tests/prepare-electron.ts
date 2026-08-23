import type { FakemicElectronPrepareContext } from '@xsai-apple-speech/vitest-plugin-fakemic'
import type { Page } from 'playwright'

export interface ExampleElectronSession {
  close: () => Promise<void>
  page: Page
}

export default async function prepareElectron(
  context: FakemicElectronPrepareContext,
): Promise<ExampleElectronSession> {
  const page = await context.app.firstWindow()
  await page.waitForSelector('[data-testid="capability-panel"]')
  return { close: context.close, page }
}
