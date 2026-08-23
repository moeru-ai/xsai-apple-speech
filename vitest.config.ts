import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          exclude: [
            '**/node_modules/**',
            'examples/**/*.audio.test.ts',
            'packages/vitest-plugin-fakemic/**/*.test.ts',
          ],
          include: ['packages/**/*.test.ts', 'examples/**/*.test.ts'],
          name: 'unit',
        },
      },
    ],
  },
})
