import type { AppleSpeechLocale } from './types'
import { AppleSpeechLocaleError } from './errors'

/**
 * Converts a BCP 47 identifier to its canonical form.
 *
 * @example
 * canonicalizeLocale('en-us')
 * // => 'en-US'
 */
export function canonicalizeLocale(locale: string): string {
  try {
    const canonicalLocales = Intl.getCanonicalLocales(locale)
    const canonicalLocale = canonicalLocales[0]
    if (canonicalLocales.length !== 1 || canonicalLocale == null)
      throw new RangeError('Expected one locale identifier.')

    return canonicalLocale
  }
  catch {
    throw new AppleSpeechLocaleError({
      reason: 'malformed',
      requestedLocale: locale,
    })
  }
}

export function canonicalizeLocales(locales: AppleSpeechLocale[]): AppleSpeechLocale[] {
  const localesByIdentifier = new Map<string, AppleSpeechLocale>()

  for (const item of locales) {
    const locale = canonicalizeLocale(item.locale)
    const existing = localesByIdentifier.get(locale)
    localesByIdentifier.set(locale, {
      installed: item.installed || existing?.installed === true,
      locale,
    })
  }

  return [...localesByIdentifier.values()]
    .sort((left, right) => left.locale.localeCompare(right.locale))
}

export function assertSupportedLocale(
  requestedLocale: string,
  locales: AppleSpeechLocale[],
): void {
  if (locales.some(item => item.locale === requestedLocale))
    return

  throw new AppleSpeechLocaleError({
    reason: 'unsupported',
    requestedLocale,
    supportedLocales: locales.map(item => item.locale),
  })
}
