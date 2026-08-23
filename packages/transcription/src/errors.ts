import type { AppleSpeechUnavailableReason } from './types'

import { XSAIError } from '@xsai/shared'

export type AppleSpeechLocaleErrorReason = 'malformed' | 'unsupported'

/** Creates a Node-serializable cancellation Error with AbortError semantics. */
export function createAbortError(message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export class AppleSpeechUnavailableError extends XSAIError {
  readonly reason: AppleSpeechUnavailableReason

  constructor(reason: AppleSpeechUnavailableReason, options?: ErrorOptions) {
    super(reason.message, 'apple_speech_unavailable', options)
    this.name = 'AppleSpeechUnavailableError'
    this.reason = reason
  }
}

export class AppleSpeechLocaleError extends XSAIError {
  readonly reason: AppleSpeechLocaleErrorReason
  readonly requestedLocale: string
  readonly supportedLocales: string[]

  constructor(options: {
    reason: AppleSpeechLocaleErrorReason
    requestedLocale: string
    supportedLocales?: string[]
  }) {
    const supportedLocales = options.supportedLocales ?? []
    const message = options.reason === 'malformed'
      ? `Apple Speech received malformed locale "${options.requestedLocale}".`
      : `Apple Speech does not support locale "${options.requestedLocale}". Supported locales: ${supportedLocales.join(', ')}.`

    super(message, 'apple_speech_locale_error')
    this.name = 'AppleSpeechLocaleError'
    this.reason = options.reason
    this.requestedLocale = options.requestedLocale
    this.supportedLocales = supportedLocales
  }
}
