import { execFile } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)

/**
 * Creates the audio fixture for the Electron Fakemic tests.
 *
 * Call stack:
 *
 * `pnpm fixture:fakemic`
 *   -> `main`
 *     -> `say`
 *     -> `afconvert`
 */
async function main(): Promise<void> {
  const output = resolve('tests/fixtures/hello.wav')
  const intermediate = resolve('tests/fixtures/hello.aiff')

  await mkdir(dirname(output), { recursive: true })
  try {
    await execute('say', [
      '--output-file',
      intermediate,
      'Hello from Apple Speech.',
    ])
    await execute('afconvert', [
      '-f',
      'WAVE',
      '-d',
      'LEI16@22050',
      intermediate,
      output,
    ])
  }
  finally {
    await rm(intermediate, { force: true })
  }
}

await main()
