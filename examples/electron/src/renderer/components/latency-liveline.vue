<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef, watch } from 'vue'

const props = defineProps<{
  active: boolean
  points: Array<{
    elapsedMilliseconds: number
    valueMilliseconds: number
  }>
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const currentLatency = computed(() => props.points.at(-1)?.valueMilliseconds)
const peakLatency = computed(() => Math.max(0, ...props.points.map(point => point.valueMilliseconds)))

let animationFrame = 0
let renderedLatency = 0
let resizeObserver: ResizeObserver | undefined

function draw(): void {
  const element = canvas.value
  if (!element)
    return

  const context = element.getContext('2d')
  if (!context)
    return

  const { height, width } = element.getBoundingClientRect()
  const pixelRatio = window.devicePixelRatio || 1
  const bitmapWidth = Math.max(1, Math.round(width * pixelRatio))
  const bitmapHeight = Math.max(1, Math.round(height * pixelRatio))
  if (element.width !== bitmapWidth || element.height !== bitmapHeight) {
    element.width = bitmapWidth
    element.height = bitmapHeight
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, width, height)

  const primary = '#6366f1'
  const padding = { bottom: 18, left: 10, right: 12, top: 12 }
  const chartWidth = Math.max(1, width - padding.left - padding.right)
  const chartHeight = Math.max(1, height - padding.top - padding.bottom)

  if (props.points.length === 0) {
    animationFrame = requestAnimationFrame(draw)
    return
  }

  const targetLatency = currentLatency.value ?? 0
  renderedLatency += (targetLatency - renderedLatency) * 0.08
  if (Math.abs(targetLatency - renderedLatency) < 0.1)
    renderedLatency = targetLatency

  const values = props.points.map(point => point.valueMilliseconds)
  values[values.length - 1] = renderedLatency
  const maximum = Math.max(120, ...values) * 1.15
  const latestTime = props.points.at(-1)?.elapsedMilliseconds ?? 0
  const earliestTime = Math.max(0, latestTime - 15_000)
  const visiblePoints = props.points.filter(point => point.elapsedMilliseconds >= earliestTime)

  const coordinates = visiblePoints.map((point, index) => {
    const elapsedWindow = Math.max(1, latestTime - earliestTime)
    const x = padding.left + (point.elapsedMilliseconds - earliestTime) / elapsedWindow * chartWidth
    const value = index === visiblePoints.length - 1 ? renderedLatency : point.valueMilliseconds
    const y = padding.top + chartHeight - value / maximum * chartHeight
    return { x, y }
  })

  if (coordinates.length === 1)
    coordinates.unshift({ x: padding.left, y: coordinates[0]?.y ?? padding.top + chartHeight })

  const firstCoordinate = coordinates[0]
  if (!firstCoordinate) {
    animationFrame = requestAnimationFrame(draw)
    return
  }

  context.beginPath()
  coordinates.forEach((point, index) => {
    if (index === 0)
      context.moveTo(point.x, point.y)
    else
      context.lineTo(point.x, point.y)
  })
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = 2
  context.strokeStyle = primary
  context.stroke()

  const endpoint = coordinates.at(-1)
  if (endpoint) {
    const pulse = props.active ? 4 + Math.sin(performance.now() / 240) * 1.5 : 4
    context.beginPath()
    context.arc(endpoint.x, endpoint.y, pulse, 0, Math.PI * 2)
    context.fillStyle = primary
    context.fill()
  }

  animationFrame = requestAnimationFrame(draw)
}

function startDrawing(): void {
  const handleResize = () => {
    cancelAnimationFrame(animationFrame)
    animationFrame = requestAnimationFrame(draw)
  }

  resizeObserver = new ResizeObserver(handleResize)
  if (canvas.value)
    resizeObserver.observe(canvas.value)
  animationFrame = requestAnimationFrame(draw)
}

function stopDrawing(): void {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
}

watch(() => props.points.length, (pointCount) => {
  if (pointCount === 0)
    renderedLatency = 0
})
onMounted(startDrawing)
onUnmounted(stopDrawing)
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-start justify-between gap-3 px-1">
      <div>
        <div class="text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Recognition latency
        </div>
        <div class="mt-0.5 text-xs text-neutral-400">
          Spoken audio to partial text
        </div>
      </div>
      <div class="text-right">
        <div class="font-mono text-lg font-650 tabular-nums text-neutral-800 dark:text-neutral-100">
          {{ currentLatency === undefined ? '—' : currentLatency }}<span v-if="currentLatency !== undefined" class="ml-1 text-[0.65rem] text-neutral-400">ms</span>
        </div>
        <div class="text-xs text-neutral-400">
          Peak {{ peakLatency || '—' }} ms
        </div>
      </div>
    </div>
    <canvas
      ref="canvas"
      class="h-20 w-full rounded-lg bg-neutral-100 dark:bg-neutral-900"
      aria-label="Recognition latency over the last 15 seconds"
      role="img"
    />
  </section>
</template>
