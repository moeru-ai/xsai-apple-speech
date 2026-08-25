import type { Preset } from 'unocss'

import { presetChromatic } from '@proj-airi/unocss-preset-chromatic'
import { defineConfig, presetIcons, presetWind4, transformerVariantGroup } from 'unocss'

// NOTICE:
// Keep Chromatic's dynamic palette valid when presetWind4 generates color-mix utilities.
// @proj-airi/unocss-preset-chromatic@1.1.4 emits the Wind3 `%alpha` placeholder.
// Source: node_modules/@proj-airi/unocss-preset-chromatic/dist/shared-Dt_PWdg9.mjs.
// Remove this map when the preset publishes native Wind4 color values.
const wind4Primary = {
  50: 'color-mix(in srgb, oklch(95% calc(var(--chromatic-chroma-50) * var(--chromatic-sat)) var(--chromatic-hue)) 30%, white)',
  100: 'color-mix(in srgb, oklch(95% calc(var(--chromatic-chroma-100) * var(--chromatic-sat)) var(--chromatic-hue)) 80%, white)',
  200: 'oklch(90% calc(var(--chromatic-chroma-200) * var(--chromatic-sat)) var(--chromatic-hue))',
  300: 'oklch(85% calc(var(--chromatic-chroma-300) * var(--chromatic-sat)) var(--chromatic-hue))',
  400: 'oklch(74% calc(var(--chromatic-chroma-400) * var(--chromatic-sat)) var(--chromatic-hue))',
  500: 'oklch(62% calc(var(--chromatic-chroma-500) * var(--chromatic-sat)) var(--chromatic-hue))',
  600: 'oklch(54% calc(var(--chromatic-chroma-600) * var(--chromatic-sat)) var(--chromatic-hue))',
  700: 'oklch(49% calc(var(--chromatic-chroma-700) * var(--chromatic-sat)) var(--chromatic-hue))',
  800: 'oklch(42% calc(var(--chromatic-chroma-800) * var(--chromatic-sat)) var(--chromatic-hue))',
  900: 'oklch(37% calc(var(--chromatic-chroma-900) * var(--chromatic-sat)) var(--chromatic-hue))',
  950: 'oklch(29% calc(var(--chromatic-chroma-950) * var(--chromatic-sat)) var(--chromatic-hue))',
}

export default defineConfig({
  content: {
    filesystem: [
      'node_modules/@proj-airi/ui/src/**/*.{ts,vue}',
    ],
  },
  presets: [
    presetWind4({
      preflights: {
        reset: false,
      },
    }),
    presetIcons({ scale: 1.15 }),
    presetChromatic({
      baseHue: 220.44,
      colors: {
        primary: 0,
        complementary: 180,
      },
    }) as Preset,
  ],
  shortcuts: {
    'control-label': 'text-xs font-medium text-neutral-500 dark:text-neutral-400',
    'surface-panel': 'rounded-2xl bg-white/80 backdrop-blur-lg dark:bg-neutral-900/75',
    'ui-button': 'h-8 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-650 transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
    'ui-button-ghost': 'ui-button bg-transparent text-neutral-600 hover:bg-primary-500/10 hover:text-primary-700 dark:text-neutral-300 dark:hover:text-primary-300',
    'ui-button-primary': 'ui-button bg-primary-500/90 text-white shadow-sm shadow-primary-500/15 hover:bg-primary-600 dark:bg-primary-400/80 dark:hover:bg-primary-400',
  },
  transformers: [
    transformerVariantGroup(),
  ],
  theme: {
    colors: {
      primary: wind4Primary,
    },
  },
})
