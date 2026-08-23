<script setup lang="ts">
import type {
  AppleSpeechAvailability,
  AppleSpeechLoadProgress,
  AppleSpeechLocale,
  TranscriptionEvent,
  TranscriptionRange,
} from '@xsai-apple-speech/transcription'

import type {
  MicrophoneTranscription,
  SpeechRequestSettings,
  TranscriptionOptionOverrides,
} from './libs/apple-speech'

import { errorMessageFrom } from '@moeru/std/error'
import {
  FieldCheckbox,
  FieldInput,
  FieldInputFile,
  FieldSelect,
  FieldTextArea,
  Progress,
  SelectTab,
} from '@proj-airi/ui'
import { useDark, useToggle } from '@vueuse/core'
import { createAbortError } from '@xsai-apple-speech/transcription'
import { generateTranscription } from '@xsai/generate-transcription'
import { animate, stagger } from 'animejs'
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue'

import AnimatedTranscript from './components/animated-transcript.vue'
import LatencyLiveline from './components/latency-liveline.vue'

import {
  appleSpeechProvider,
  createSpeechRequestConfiguration,
  startMicrophoneTranscription,
} from './libs/apple-speech'

type TranscriptionMode = 'file' | 'streaming'
type OptionDefault = boolean | Record<TranscriptionMode, boolean>

interface SpeechPlaygroundSettings extends SpeechRequestSettings {
  locale: string
  mode: TranscriptionMode
}

interface RecognitionLatencyPoint {
  elapsedMilliseconds: number
  valueMilliseconds: number
}

interface TranscriptSegment {
  id: string
  text: string
}

const speechSettings = reactive<SpeechPlaygroundSettings>({
  contextualStrings: '',
  customLanguageModel: '',
  customVocabulary: '',
  customWeight: undefined,
  locale: 'en-US',
  mode: 'streaming',
  overrides: {},
  transcriber: 'automatic',
})

const modeOptions = [
  { icon: 'i-solar:microphone-3-bold-duotone', label: 'Streaming', value: 'streaming' as const },
  { icon: 'i-solar:file-send-bold-duotone', label: 'File', value: 'file' as const },
]
const transcriberOptions = [
  { label: 'Automatic', value: 'automatic' as const },
  { label: 'Speech', value: 'speech' as const },
  { label: 'Dictation', value: 'dictation' as const },
]

const workspace = useTemplateRef<HTMLElement>('workspace')
const isDark = useDark({ disableTransition: false })
const toggleDark = useToggle(isDark)
let entranceAnimation: ReturnType<typeof animate> | undefined

const availability = shallowRef<AppleSpeechAvailability>()
const capabilityStatus = shallowRef('Looking for available languages…')
const loadProgress = shallowRef<AppleSpeechLoadProgress>()
const capabilityError = shallowRef('')
const isRefreshingLocales = shallowRef(false)
const localeLoadController = shallowRef<AbortController>()
const speechLocales = shallowRef<AppleSpeechLocale[]>([])
let refreshRequestId = 0

const transcriberDescription = computed(() => {
  if (speechSettings.transcriber === 'speech')
    return 'Use SpeechTranscriber for every session.'
  if (speechSettings.transcriber === 'dictation')
    return 'Use DictationTranscriber and its dictation options.'
  return 'Prefer SpeechTranscriber and use DictationTranscriber as a locale fallback.'
})
const localeOptions = computed(() => speechLocales.value.map(item => ({
  installed: item.installed,
  label: `${item.locale}${item.installed ? ' · Installed' : ' · Download required'}`,
  value: item.locale,
})))
const selectedLanguage = computed(() =>
  localeOptions.value.find(option => option.value === speechSettings.locale),
)

async function refreshLocales(): Promise<void> {
  const requestId = ++refreshRequestId
  const transcriber = speechSettings.transcriber
  isRefreshingLocales.value = true
  availability.value = undefined
  capabilityStatus.value = 'Looking for available languages…'
  capabilityError.value = ''
  try {
    const currentAvailability = await appleSpeechProvider.isAvailable({ transcriber })
    if (requestId !== refreshRequestId)
      return

    availability.value = currentAvailability
    if (!currentAvailability.available) {
      speechLocales.value = []
      capabilityStatus.value = 'Apple Speech is not available on this Mac.'
      return
    }

    const locales = await appleSpeechProvider.getLocales({ transcriber })
    if (requestId !== refreshRequestId)
      return

    speechLocales.value = locales
    if (!locales.some(item => item.locale === speechSettings.locale))
      speechSettings.locale = locales[0]?.locale ?? ''
    capabilityStatus.value = `${locales.length} languages are available.`
  }
  catch (error) {
    if (requestId !== refreshRequestId)
      return

    capabilityStatus.value = 'Could not load the language list.'
    capabilityError.value = errorMessageFrom(error) ?? String(error)
  }
  finally {
    if (requestId === refreshRequestId)
      isRefreshingLocales.value = false
  }
}

async function loadLocale(): Promise<void> {
  localeLoadController.value?.abort(createAbortError('The previous language preparation was canceled.'))
  const controller = new AbortController()
  const locale = speechSettings.locale
  const transcriber = speechSettings.transcriber
  localeLoadController.value = controller
  loadProgress.value = undefined
  capabilityError.value = ''
  capabilityStatus.value = `Preparing ${locale}…`
  try {
    await appleSpeechProvider.load({
      abortSignal: controller.signal,
      locale,
      onProgress: (value: AppleSpeechLoadProgress) => {
        loadProgress.value = value
      },
      transcriber,
    })
    if (localeLoadController.value === controller)
      capabilityStatus.value = `${locale} is ready to use.`
  }
  catch (error) {
    if (localeLoadController.value !== controller)
      return

    capabilityStatus.value = controller.signal.aborted
      ? 'Language preparation was canceled.'
      : 'Could not prepare this language.'
    if (!controller.signal.aborted)
      capabilityError.value = errorMessageFrom(error) ?? String(error)
  }
  finally {
    if (localeLoadController.value === controller)
      localeLoadController.value = undefined
  }
}

function cancelLocaleLoad(): void {
  const controller = localeLoadController.value
  localeLoadController.value = undefined
  controller?.abort(createAbortError('The language preparation was canceled.'))
}

const advancedOpen = shallowRef(false)
const showsSpeechOptions = computed(() => speechSettings.transcriber !== 'dictation')
const showsDictationOptions = computed(() => speechSettings.transcriber !== 'speech')

function optionModel(key: keyof TranscriptionOptionOverrides, defaultValue: OptionDefault) {
  return computed({
    get: () => speechSettings.overrides[key] ?? (typeof defaultValue === 'boolean'
      ? defaultValue
      : defaultValue[speechSettings.mode]),
    set: (value: boolean) => {
      speechSettings.overrides[key] = value
    },
  })
}

const applyEtiquetteReplacements = optionModel('applyEtiquetteReplacements', false)
const includeAlternativeTranscriptions = optionModel('includeAlternativeTranscriptions', false)
const includeAudioTimeRange = optionModel('includeAudioTimeRange', { file: false, streaming: true })
const includeTranscriptionConfidence = optionModel('includeTranscriptionConfidence', false)
const preferFastResults = optionModel('preferFastResults', { file: false, streaming: true })
const includePunctuation = optionModel('includePunctuation', true)
const includeEmoji = optionModel('includeEmoji', false)
const preferFrequentFinalization = optionModel('preferFrequentFinalization', false)
const shortForm = optionModel('shortForm', false)
const farField = optionModel('farField', false)
const atypicalSpeech = optionModel('atypicalSpeech', false)

function resetSpeechRequestSettings(): void {
  speechSettings.overrides = {}
  speechSettings.contextualStrings = ''
  speechSettings.customLanguageModel = ''
  speechSettings.customVocabulary = ''
  speechSettings.customWeight = undefined
}

const audioFiles = ref<File[]>()
const batchStatus = shallowRef('Choose an audio file')
const batchTranscript = shallowRef('')
const batchError = shallowRef('')
const generationController = shallowRef<AbortController>()
const audioFile = computed(() => audioFiles.value?.[0])
const emptyBatchTranscriptText = computed(() => batchStatus.value === 'Transcript complete'
  ? 'No speech was detected.'
  : 'Transcribe a file to see the transcript.')

async function transcribeFile(): Promise<void> {
  if (!audioFile.value)
    return

  generationController.value?.abort(createAbortError('The previous file transcription was canceled.'))
  const controller = new AbortController()
  generationController.value = controller
  batchTranscript.value = ''
  batchError.value = ''
  batchStatus.value = 'Transcribing the audio file…'
  try {
    const result = await generateTranscription({
      ...appleSpeechProvider.transcription({
        ...createSpeechRequestConfiguration(speechSettings),
        locale: speechSettings.locale,
      }),
      abortSignal: controller.signal,
      file: audioFile.value,
    })
    if (generationController.value !== controller)
      return
    batchTranscript.value = result.text
    batchStatus.value = 'Transcript complete'
  }
  catch (error) {
    if (generationController.value !== controller)
      return
    batchStatus.value = controller.signal.aborted
      ? 'File transcription was canceled.'
      : 'Could not transcribe this file.'
    if (!controller.signal.aborted)
      batchError.value = errorMessageFrom(error) ?? String(error)
  }
  finally {
    if (generationController.value === controller)
      generationController.value = undefined
  }
}

function cancelFileTranscription(): void {
  generationController.value?.abort(createAbortError('File transcription was canceled.'))
}

const liveStatus = shallowRef('Ready to listen')
const microphonePermission = shallowRef<PermissionState | 'unknown'>('unknown')
const currentTranscript = shallowRef('')
const transcriptSegments = shallowRef<TranscriptSegment[]>([])
const latencyPoints = ref<RecognitionLatencyPoint[]>([])
const liveError = shallowRef('')
const sampleRate = shallowRef<number>()
const microphoneTranscription = shallowRef<MicrophoneTranscription>()
const isChangingSession = computed(() => liveStatus.value === 'Requesting microphone access…' || liveStatus.value === 'Finishing…')
let captureStartedAt = 0
let committedTranscript = ''

function recognitionLatency(receivedAt: number, range: TranscriptionRange): number {
  return Math.max(0, Math.round(receivedAt - captureStartedAt - range.startMilliseconds - range.durationMilliseconds))
}

async function readMicrophonePermission(): Promise<void> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    microphonePermission.value = status.state
  }
  catch {
    microphonePermission.value = 'unknown'
  }
}

function uncommittedTranscript(snapshot: string): string {
  return snapshot.startsWith(committedTranscript)
    ? snapshot.slice(committedTranscript.length).trim()
    : snapshot.trim()
}

function commitTranscript(snapshot: string, id: string): void {
  const text = uncommittedTranscript(snapshot)
  committedTranscript = snapshot
  currentTranscript.value = ''
  if (text)
    transcriptSegments.value = [...transcriptSegments.value, { id, text }]
}

function handleTranscriptionEvent(event: TranscriptionEvent): void {
  if (event.type === 'transcript.text.done') {
    commitTranscript(event.text.trim(), `complete:${transcriptSegments.value.length}`)
    return
  }

  const snapshot = event.text.trim()
  if (event.range.isFinal)
    commitTranscript(snapshot, `${event.range.startMilliseconds}:${event.range.durationMilliseconds}`)
  else
    currentTranscript.value = uncommittedTranscript(snapshot)

  const receivedAt = performance.now()
  latencyPoints.value = [
    ...latencyPoints.value,
    {
      elapsedMilliseconds: receivedAt - captureStartedAt,
      valueMilliseconds: recognitionLatency(receivedAt, event.range),
    },
  ].slice(-80)
}

async function startListening(): Promise<void> {
  if (microphoneTranscription.value)
    return

  liveStatus.value = 'Requesting microphone access…'
  committedTranscript = ''
  currentTranscript.value = ''
  transcriptSegments.value = []
  latencyPoints.value = []
  liveError.value = ''
  try {
    captureStartedAt = performance.now()
    const active = await startMicrophoneTranscription({
      configuration: createSpeechRequestConfiguration(speechSettings),
      locale: speechSettings.locale,
      onError: (error) => {
        liveError.value = errorMessageFrom(error) ?? String(error)
      },
      onEvent: handleTranscriptionEvent,
    })
    captureStartedAt = active.startedAt
    microphoneTranscription.value = active
    sampleRate.value = active.sampleRate
    microphonePermission.value = 'granted'
    liveStatus.value = 'Listening'
  }
  catch (error) {
    await readMicrophonePermission()
    liveStatus.value = 'Could not start listening.'
    liveError.value = errorMessageFrom(error) ?? String(error)
  }
}

async function stopListening(): Promise<void> {
  const active = microphoneTranscription.value
  if (!active)
    return

  liveStatus.value = 'Finishing…'
  try {
    await active.stop()
    liveStatus.value = 'Transcript complete'
  }
  catch (error) {
    liveStatus.value = 'Could not finish the transcript.'
    liveError.value = errorMessageFrom(error) ?? String(error)
  }
  finally {
    if (microphoneTranscription.value === active)
      microphoneTranscription.value = undefined
  }
}

async function cancelListening(showStatus = true): Promise<void> {
  const active = microphoneTranscription.value
  if (!active)
    return

  if (showStatus)
    liveStatus.value = 'Canceling…'
  try {
    await active.cancel()
    if (showStatus)
      liveStatus.value = 'Session canceled'
  }
  catch (error) {
    if (showStatus) {
      liveStatus.value = 'Could not cancel the session.'
      liveError.value = errorMessageFrom(error) ?? String(error)
    }
  }
  finally {
    if (microphoneTranscription.value === active)
      microphoneTranscription.value = undefined
  }
}

watch(() => speechSettings.transcriber, () => {
  cancelLocaleLoad()
  loadProgress.value = undefined
  speechLocales.value = []
  void refreshLocales()
}, { immediate: true })
watch(audioFile, file => batchStatus.value = file?.name ?? 'Choose an audio file')
watch(() => speechSettings.mode, (mode) => {
  if (mode === 'file')
    void cancelListening(false)
})

void readMicrophonePermission()

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return

  const panels = workspace.value?.querySelectorAll<HTMLElement>('[data-enter]')
  if (!panels?.length)
    return

  entranceAnimation = animate(panels, {
    delay: stagger(55),
    duration: 420,
    ease: 'out(3)',
    opacity: { from: 0 },
    y: { from: 12 },
  })
})

onUnmounted(() => {
  entranceAnimation?.cancel()
  cancelLocaleLoad()
  cancelFileTranscription()
  void cancelListening(false)
})
</script>

<template>
  <div
    ref="workspace"
    class="mx-auto min-h-screen max-w-300 p-4 sm:p-7 text-neutral-900 dark:text-neutral-100"
  >
    <header data-enter class="mb-7 flex items-center justify-between gap-4">
      <div class="min-w-0 flex items-center gap-3">
        <div class="h-9 w-9 shrink-0 grid place-items-center rounded-xl bg-primary-300/45 text-primary-900 dark:bg-primary-400/30 dark:text-primary-100">
          <div class="i-solar:soundwave-bold-duotone h-5 w-5" />
        </div>
        <h1 class="m-0 truncate text-xl font-normal tracking-tight">
          Apple Speech
        </h1>
      </div>
      <button
        class="ui-button-ghost w-8 px-0"
        :aria-label="isDark ? 'Use light theme' : 'Use dark theme'"
        @click="toggleDark()"
      >
        <span :class="isDark ? 'i-solar:sun-2-bold-duotone' : 'i-solar:moon-stars-bold-duotone'" class="h-4 w-4" />
      </button>
    </header>

    <main class="flex flex-col gap-6 md:flex-row">
      <aside
        data-enter
        class="h-fit w-full flex flex-col gap-6 rounded-xl bg-neutral-100 p-4 dark:bg-[rgba(0,0,0,0.3)] md:w-[40%]"
      >
        <section class="flex flex-col gap-5" data-testid="capability-panel">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0 flex items-center gap-3">
              <div class="h-9 w-9 shrink-0 grid place-items-center rounded-xl bg-primary-200/55 text-primary-800 dark:bg-primary-500/20 dark:text-primary-200">
                <span class="i-solar:tuning-2-bold-duotone h-4.5 w-4.5" />
              </div>
              <div class="min-w-0">
                <h2 class="m-0 text-sm font-medium">
                  Speech engine
                </h2>
                <p class="m-0 mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400" data-testid="capability-status">
                  {{ capabilityStatus }}
                </p>
              </div>
            </div>
            <button
              class="ui-button-ghost w-8 px-0"
              type="button"
              :aria-label="isRefreshingLocales ? 'Refreshing languages' : 'Refresh languages'"
              :disabled="isRefreshingLocales"
              @click="refreshLocales"
            >
              <span class="h-4 w-4" :class="[isRefreshingLocales ? 'i-svg-spinners:ring-resize' : 'i-solar:refresh-bold-duotone']" />
            </button>
          </div>

          <div class="flex flex-col gap-2">
            <label class="control-label">Transcriber</label>
            <SelectTab
              v-model="speechSettings.transcriber"
              :options="transcriberOptions"
              size="sm"
              tab-space="compact"
              data-testid="transcriber-select"
            />
            <p class="m-0 text-xs leading-5 text-neutral-400 dark:text-neutral-500">
              {{ transcriberDescription }}
            </p>
          </div>

          <FieldSelect
            v-model="speechSettings.locale"
            label="Speech language"
            :options="localeOptions"
            placeholder="Select a speech language"
            layout="vertical"
            :disabled="speechLocales.length === 0"
            select-class="border-none! bg-white! shadow-none! dark:bg-neutral-800!"
            data-testid="locale-select"
          />

          <div class="flex items-center gap-1">
            <button class="ui-button-primary flex-1" type="button" :disabled="!speechSettings.locale" @click="loadLocale">
              <span class="h-4 w-4" :class="[localeLoadController ? 'i-svg-spinners:ring-resize' : 'i-solar:download-minimalistic-bold-duotone']" />
              Prepare language
            </button>
            <button v-if="localeLoadController" class="ui-button-ghost" type="button" @click="cancelLocaleLoad">
              Cancel
            </button>
          </div>

          <Progress v-if="loadProgress?.status === 'progress'" :progress="loadProgress.progress" data-testid="load-progress" />
          <p v-if="availability && !availability.available" class="m-0 text-xs text-red-600 dark:text-red-300">
            {{ availability.reason.message }}
          </p>
          <p v-else-if="capabilityError" class="m-0 text-xs text-red-600 dark:text-red-300">
            {{ capabilityError }}
          </p>
          <p v-else-if="selectedLanguage" class="m-0 text-xs text-neutral-400 dark:text-neutral-500">
            {{ selectedLanguage.installed ? 'Installed on this Mac.' : 'Apple Speech will download this language when you prepare it.' }}
          </p>
        </section>

        <section class="flex flex-col gap-4" data-testid="transcription-options">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="m-0 text-sm font-medium">
                Recognition
              </h2>
              <p class="m-0 mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Overrides use Apple Speech defaults until you change them.
              </p>
            </div>
            <button class="ui-button-ghost px-2" type="button" @click="resetSpeechRequestSettings">
              Reset
            </button>
          </div>

          <div class="flex flex-col gap-4 rounded-xl bg-white/65 p-3 dark:bg-neutral-900/65">
            <FieldCheckbox v-model="applyEtiquetteReplacements" label="Etiquette replacements" description="Apply Apple's replacements for specified words and phrases." />
            <FieldCheckbox v-model="includeAlternativeTranscriptions" label="Alternative transcriptions" description="Include other recognition candidates in native result metadata." />
            <FieldCheckbox v-model="includeAudioTimeRange" label="Audio time ranges" description="Attach source audio ranges to attributed text." />
            <FieldCheckbox v-model="includeTranscriptionConfidence" label="Confidence values" description="Attach recognition confidence to attributed text." />
          </div>

          <div v-if="showsSpeechOptions" class="flex flex-col gap-3">
            <div class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              SpeechTranscriber
            </div>
            <div class="rounded-xl bg-white/65 p-3 dark:bg-neutral-900/65">
              <FieldCheckbox v-model="preferFastResults" label="Prefer fast results" description="Favor lower latency over recognition accuracy." />
            </div>
          </div>

          <div v-if="showsDictationOptions" class="flex flex-col gap-3">
            <div class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              DictationTranscriber
            </div>
            <div class="flex flex-col gap-4 rounded-xl bg-white/65 p-3 dark:bg-neutral-900/65">
              <FieldCheckbox v-model="includePunctuation" label="Punctuation" description="Add punctuation to the transcript." />
              <FieldCheckbox v-model="includeEmoji" label="Emoji" description="Convert spoken emoji names to emoji characters." />
              <FieldCheckbox v-model="preferFrequentFinalization" label="Frequent final results" description="Finalize text more often with a possible accuracy tradeoff." />
              <FieldCheckbox v-model="shortForm" label="Short-form audio" description="Optimize recognition for audio near one minute." />
              <FieldCheckbox v-model="farField" label="Far-field audio" description="Optimize speech recorded far from the microphone." />
              <FieldCheckbox v-model="atypicalSpeech" label="Atypical speech" description="Optimize for a heavy accent or another speech difference." />
            </div>
          </div>

          <div>
            <button
              class="w-full flex items-center justify-between rounded-lg bg-neutral-200/55 px-3 py-2 text-left text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-200 dark:bg-neutral-800/65 dark:text-neutral-300 dark:hover:bg-neutral-800"
              type="button"
              :aria-expanded="advancedOpen"
              @click="advancedOpen = !advancedOpen"
            >
              Context and custom model
              <span :class="advancedOpen ? 'i-solar:alt-arrow-up-linear' : 'i-solar:alt-arrow-down-linear'" class="h-4 w-4" />
            </button>

            <div v-if="advancedOpen" class="mt-4 flex flex-col gap-4 rounded-xl bg-white/65 p-3 dark:bg-neutral-900/65">
              <FieldTextArea
                v-model="speechSettings.contextualStrings"
                label="Contextual phrases"
                description="Enter one word or phrase per line."
                placeholder="AIRI&#10;Moeru AI"
                :required="false"
                :rows="3"
                textarea-class="border-none! bg-neutral-100! shadow-none! dark:bg-neutral-800!"
              />
              <template v-if="showsDictationOptions">
                <FieldInput
                  v-model="speechSettings.customLanguageModel"
                  label="Language model"
                  description="Absolute path to a compiled DictationTranscriber model."
                  placeholder="/path/to/model.bin"
                  input-class="border-none! bg-neutral-100! shadow-none! dark:bg-neutral-800!"
                />
                <FieldInput
                  v-model="speechSettings.customVocabulary"
                  label="Vocabulary"
                  description="Optional absolute path to the compiled vocabulary."
                  placeholder="/path/to/vocabulary.bin"
                  input-class="border-none! bg-neutral-100! shadow-none! dark:bg-neutral-800!"
                />
                <FieldInput
                  v-model="speechSettings.customWeight"
                  label="Model weight"
                  description="Set a value from 0 through 1."
                  placeholder="1"
                  type="number"
                  input-class="border-none! bg-neutral-100! shadow-none! dark:bg-neutral-800!"
                />
              </template>
            </div>
          </div>
        </section>
      </aside>

      <section data-enter class="w-full flex flex-col gap-4 md:w-[60%]" data-testid="speech-playground">
        <div class="flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <h2 class="m-0 flex items-center gap-2 text-lg font-normal text-neutral-600 dark:text-neutral-300">
              <span class="i-solar:test-tube-minimalistic-bold-duotone h-5 w-5 text-primary-500" />
              Playground
            </h2>
            <p class="m-0 mt-1 text-sm text-neutral-400 dark:text-neutral-500">
              Speak or choose an audio file to inspect Apple Speech results.
            </p>
          </div>
          <SelectTab
            v-model="speechSettings.mode"
            :options="modeOptions"
            size="sm"
            tab-space="compact"
            class="w-full sm:w-64"
            data-testid="transcription-mode"
          />
        </div>

        <section v-if="speechSettings.mode === 'streaming'" class="flex flex-col gap-4" data-testid="live-panel">
          <div class="sr-only" aria-live="polite">
            <span data-testid="live-status">{{ liveStatus }}</span>
            <span data-testid="microphone-permission">{{ microphonePermission }}</span>
            <span v-if="sampleRate" data-testid="microphone-sample-rate">{{ sampleRate }} Hz</span>
          </div>
          <div
            v-if="liveError"
            class="flex items-start gap-2 rounded-lg bg-red-100/70 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-200"
            data-testid="live-error"
          >
            <div class="i-solar:danger-triangle-bold-duotone mt-0.5 h-4 w-4 shrink-0" />
            <span>{{ liveError }}</span>
          </div>
          <div class="mb-1 flex items-center gap-1">
            <button
              data-testid="live-start"
              class="ui-button-primary flex-1"
              type="button"
              :disabled="isChangingSession"
              @click="microphoneTranscription ? stopListening() : startListening()"
            >
              <span :class="microphoneTranscription ? 'i-solar:stop-circle-bold-duotone' : 'i-solar:microphone-3-bold-duotone'" class="h-4 w-4" />
              {{ microphoneTranscription ? 'Finish listening' : 'Start listening' }}
            </button>
            <button v-if="microphoneTranscription" class="ui-button-ghost" type="button" @click="cancelListening()">
              Cancel
            </button>
          </div>
          <AnimatedTranscript
            :active="!!microphoneTranscription"
            :current="currentTranscript"
            :locale="speechSettings.locale"
            :segments="transcriptSegments"
          />
          <LatencyLiveline :active="!!microphoneTranscription" :points="latencyPoints" />
        </section>

        <section v-else class="flex flex-col gap-4 overflow-hidden rounded-xl" data-testid="batch-panel">
          <div class="flex flex-wrap items-center gap-3 px-1">
            <div class="min-w-0 flex flex-1 items-center gap-3">
              <div class="h-9 w-9 shrink-0 grid place-items-center rounded-xl bg-primary-200/55 text-primary-800 dark:bg-primary-500/20 dark:text-primary-200">
                <div class="i-solar:file-send-bold-duotone h-4.5 w-4.5" />
              </div>
              <div class="min-w-0">
                <h3 class="m-0 text-sm font-medium">
                  File transcription
                </h3>
                <p class="m-0 mt-0.5 truncate text-xs text-neutral-400" data-testid="batch-status">
                  {{ batchStatus }}
                </p>
              </div>
            </div>
          </div>
          <div data-testid="audio-file">
            <FieldInputFile
              v-model="audioFiles"
              label="Audio file"
              description="Apple Speech processes this file on your Mac."
              accept="audio/*"
              placeholder="Choose local audio"
              input-class="border-none! bg-neutral-100! shadow-none! dark:bg-neutral-900!"
            />
          </div>
          <p v-if="batchError" class="m-0 mt-3 rounded-lg bg-red-100/70 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-200">
            {{ batchError }}
          </p>
          <div class="flex items-center gap-1">
            <button
              data-testid="batch-start"
              class="ui-button-primary flex-1"
              type="button"
              :disabled="!audioFile || !!generationController"
              @click="transcribeFile"
            >
              <span :class="generationController ? 'i-svg-spinners:ring-resize' : 'i-solar:play-bold-duotone'" class="h-4 w-4" />
              Transcribe file
            </button>
            <button v-if="generationController" class="ui-button-ghost" type="button" @click="cancelFileTranscription">
              Cancel
            </button>
          </div>
          <AnimatedTranscript
            :active="!!generationController"
            active-label="Transcribing"
            :empty-text="emptyBatchTranscriptText"
            :locale="speechSettings.locale"
            :text="batchTranscript"
          />
        </section>
      </section>
    </main>
  </div>
</template>
