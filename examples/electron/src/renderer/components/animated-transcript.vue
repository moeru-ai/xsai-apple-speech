<script setup lang="ts">
import { animate, createTimeline } from 'animejs'
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

interface PoppinTextTarget {
  grapheme: string
  id: string
  startsHidden: boolean
}

const props = withDefaults(defineProps<{
  active: boolean
  activeLabel?: string
  current?: string
  emptyText?: string
  locale: string
  segments?: readonly { id: string, text: string }[]
  text?: string
}>(), {
  activeLabel: 'Listening',
  current: '',
  emptyText: 'Start a session to see the transcript.',
  segments: () => [],
  text: '',
})

function readPoppinTargets(text: string, generation: number, locale: string): PoppinTextTarget[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(text), (segment, index) => ({
    grapheme: segment.segment,
    id: `text:${generation}:${index}`,
    startsHidden: false,
  }))
}

function updatePoppinTextTargets(
  previousTargets: readonly PoppinTextTarget[],
  text: string,
  generation: number,
  locale: string,
) {
  let nextGeneration = generation
  let targets = readPoppinTargets(text, nextGeneration, locale)
  const appendsToPreviousText = previousTargets.length <= targets.length
    && previousTargets.every((target, index) => target.grapheme === targets[index]?.grapheme)

  if (!appendsToPreviousText) {
    nextGeneration += 1
    targets = readPoppinTargets(text, nextGeneration, locale)
      .map(target => ({ ...target, startsHidden: true }))
    return { addedTargets: targets, generation: nextGeneration, targets }
  }

  const addedTargets = targets
    .slice(previousTargets.length)
    .map(target => ({ ...target, startsHidden: true }))
  targets = [...targets.slice(0, previousTargets.length), ...addedTargets]
  return { addedTargets, generation: nextGeneration, targets }
}

const completedSegments = computed<readonly { id: string, text: string }[]>(() => {
  if (props.segments.length > 0)
    return props.segments

  const text = props.text.trim()
  return text ? [{ id: 'file-result', text }] : []
})
const reversedSegments = computed(() => completedSegments.value.toReversed())
const enterAnimations = new Set<ReturnType<typeof animate>>()
const poppinElements = useTemplateRef<HTMLElement[]>('poppinElements')
const poppinTargets = ref<PoppinTextTarget[]>([])
const poppinTimelines = new Set<ReturnType<typeof createTimeline>>()
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const poppinInitialStyle = prefersReducedMotion ? undefined : { opacity: 0 }
let poppinGeneration = 0
let isMounted = false

function shouldAnimateRow(row: HTMLElement): boolean {
  // PoppinText owns the Current row animation. Hiding that row here leaves it
  // invisible because the row entrance deliberately skips it.
  return !row.hasAttribute('data-current')
    && !prefersReducedMotion
}

function handleBeforeEnter(element: Element): void {
  const row = element as HTMLElement
  if (!shouldAnimateRow(row))
    return

  row.style.opacity = '0'
  row.style.transform = 'translateY(10px)'
}

function handleEnter(element: Element, done: () => void): void {
  if (!shouldAnimateRow(element as HTMLElement)) {
    done()
    return
  }

  const animation = animate(element, {
    duration: 360,
    ease: 'out(4)',
    opacity: 1,
    y: 0,
  })
  enterAnimations.add(animation)
  void animation.then(() => {
    enterAnimations.delete(animation)
    done()
  })
}

function animatePoppinTargets(targetIds: ReadonlySet<string>): void {
  if (prefersReducedMotion)
    return

  const elements = poppinElements.value?.filter(element => targetIds.has(element.dataset.poppinId ?? '')) ?? []
  if (elements.length === 0)
    return

  const duration = 100
  const timeline = createTimeline({ loop: false })
    .set(elements, { opacity: 0 })
    .add(elements, {
      delay: (_, index) => duration / elements.length * ((index ?? 0) + 1),
      duration,
      opacity: [0, 1],
    })
  poppinTimelines.add(timeline)
}

async function updatePoppinText(text: string): Promise<void> {
  const update = updatePoppinTextTargets(poppinTargets.value, text, poppinGeneration, props.locale)
  poppinGeneration = update.generation
  poppinTargets.value = [...update.targets]
  if (!isMounted || update.addedTargets.length === 0)
    return

  await nextTick()
  animatePoppinTargets(new Set(update.addedTargets.map(target => target.id)))
}

function stopAnimations(): void {
  for (const animation of enterAnimations)
    animation.cancel()
  enterAnimations.clear()

  for (const timeline of poppinTimelines)
    timeline.remove(poppinElements.value ?? [])
  poppinTimelines.clear()
}

watch(() => props.current, updatePoppinText, { immediate: true })
onMounted(() => {
  isMounted = true
  animatePoppinTargets(new Set(poppinTargets.value.map(target => target.id)))
})
onUnmounted(stopAnimations)
</script>

<template>
  <section class="flex flex-col gap-3 mb-1">
    <div class="flex items-center justify-between gap-3 px-1">
      <span class="text-sm font-medium text-neutral-600 dark:text-neutral-300">
        Transcript
      </span>
      <span
        class="flex items-center gap-1.5 text-xs" :class="[
          active ? 'text-primary-600 dark:text-primary-300' : 'text-neutral-400',
        ]"
      >
        <span
          class="h-1.5 w-1.5 rounded-full" :class="[
            active ? 'animate-pulse bg-primary-500' : 'bg-neutral-300 dark:bg-neutral-700',
          ]"
        />
        {{ active ? activeLabel : locale }}
      </span>
    </div>

    <div
      class="min-h-28 rounded-xl"
      aria-live="polite"
    >
      <TransitionGroup
        v-if="current || completedSegments.length"
        tag="ol"
        :css="false"
        class="m-0 max-h-xs flex list-none flex-col overflow-y-auto p-0 rounded-xl bg-neutral-100 dark:bg-neutral-900"
        data-testid="partial-transcript"
        @before-enter="handleBeforeEnter"
        @enter="handleEnter"
      >
        <li
          v-if="current"
          key="current"
          data-current
          class="rounded-lg px-3 py-2 bg-primary-50 dark:bg-primary-900/20"
          data-testid="transcript-current"
        >
          <div class="mb-1 text-xs text-primary-600 font-medium dark:text-primary-400">
            Current
          </div>
          <p class="m-0 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-200">
            <span class="whitespace-pre-wrap">
              <span
                v-for="target in poppinTargets"
                :key="target.id"
                ref="poppinElements"
                class="inline-block whitespace-pre-wrap"
                :data-poppin-id="target.id"
                :style="target.startsHidden && !prefersReducedMotion ? poppinInitialStyle : undefined"
                data-testid="poppin-grapheme"
              >{{ target.grapheme }}</span>
            </span>
          </p>
        </li>

        <li
          v-for="(segment, index) in reversedSegments"
          :key="segment.id"
          class="flex flex-col gap-3 px-3 py-2"
          data-testid="transcript-segment"
        >
          <div class="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
            Segment {{ completedSegments.length - index }}
          </div>
          <p
            class="m-0 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-200"
            data-testid="transcript-segment-text"
          >
            {{ segment.text }}
          </p>
        </li>
      </TransitionGroup>

      <div
        v-else-if="active"
        class="min-h-20 flex items-center justify-center gap-2 text-sm text-neutral-400 dark:text-neutral-500"
      >
        <span class="i-solar:microphone-3-line-duotone animate-pulse" />
        {{ activeLabel }}
      </div>

      <div
        v-else
        class="min-h-20 flex items-center justify-center text-center text-sm text-neutral-400 dark:text-neutral-500"
      >
        {{ emptyText }}
      </div>
    </div>
  </section>
</template>
