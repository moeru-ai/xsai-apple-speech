import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  ignores: [
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/release/**',
  ],
  typescript: true,
  vue: true,
})
