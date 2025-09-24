<template>
  <div class="h-screen flex flex-col bg-gray-50">
    <!-- Main content area with three panels -->
    <div class="flex-1 overflow-hidden flex">
      <!-- File Explorer Panel -->
      <div class="overflow-hidden bg-gray-100" :style="{ width: `${uiStore.fileExplorerWidth * 100}%` }">
        <FileExplorer />
      </div>

      <!-- File Explorer Divider -->
      <div
        class="flex-none border-transparent bg-clip-padding bg-zinc-700 hover:bg-blue-500 hover:border-blue-500/50 transition-all duration-200 z-10 w-[11px] -mx-[5px] border-x-[5px] cursor-col-resize"
        @mousedown="(e) => startResize(e, 0)" />

      <!-- Editor Panel -->
      <div class="overflow-hidden" :style="{ width: `${uiStore.editorWidth * 100}%` }">
        <EditorPanel />
      </div>

      <!-- Editor Divider -->
      <div v-if="uiStore.isConsoleVisible"
        class="flex-none border-transparent bg-clip-padding bg-zinc-700 hover:bg-blue-500 hover:border-blue-500/50 transition-all duration-200 z-10 w-[11px] -mx-[5px] border-x-[5px] cursor-col-resize"
        @mousedown="(e) => startResize(e, 1)" />

      <!-- Console Panel -->
      <div v-if="uiStore.isConsoleVisible" class="overflow-hidden flex-1">
        <ConsolePanel />
      </div>
    </div>

    <!-- Status Bar -->
    <StatusBar />
  </div>
</template>

<script setup lang="ts">
import EditorPanel from './components/EditorPanel.vue'
import ConsolePanel from './components/ConsolePanel.vue'
import FileExplorer from './components/FileExplorer.vue'
import StatusBar from './components/StatusBar.vue'
import { useUIStore } from './stores/ui'
import { ref } from 'vue'

const uiStore = useUIStore()
const isResizing = ref(false)

const startResize = (event: MouseEvent, divisionIndex: number) => {
  isResizing.value = true
  const container = (event.target as HTMLElement).parentElement!
  const containerSize = container.offsetWidth

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value) return

    const currentPos = e.clientX
    const containerRect = container.getBoundingClientRect()
    const relativePos = currentPos - containerRect.left
    const ratio = relativePos / containerSize

    uiStore.updateDivision(divisionIndex, ratio)
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

// Language server is initialized by the editor once a file is open
</script>
