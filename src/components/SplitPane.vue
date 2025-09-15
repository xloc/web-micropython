<template>
  <div class="flex h-full flex-row">
    <!-- First panel -->
    <div class="overflow-hidden" :style="firstPanelStyle">
      <slot name="first" />
    </div>

    <div
      class="flex-none border-transparent bg-clip-padding bg-zinc-500 hover:bg-blue-500 hover:border-blue-500/50 transition-all duration-200 z-10 w-[11px] -mx-[5px] border-x-[5px] cursor-col-resize"
      @mousedown="startResize" />

    <!-- Second panel -->
    <div class="overflow-hidden flex-1">
      <slot name="second" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface Props {
  splitRatio: number
  minSize?: number
}

const props = withDefaults(defineProps<Props>(), {
  minSize: 100
})

const emit = defineEmits<{
  update: [ratio: number]
}>()

const isResizing = ref(false)

const firstPanelStyle = computed(() => {
  const size = props.splitRatio * 100
  return { width: `${size}%` }
})

const startResize = (event: MouseEvent) => {
  isResizing.value = true
  const container = (event.target as HTMLElement).parentElement!
  const containerSize = container.offsetWidth

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value) return

    const currentPos = e.clientX
    const containerRect = container.getBoundingClientRect()
    const relativePos = currentPos - containerRect.left

    const ratio = Math.max(0.1, Math.min(0.9, relativePos / containerSize))
    emit('update', ratio)
  }

  const handleMouseUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}
</script>
