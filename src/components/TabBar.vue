<template>
  <div class="flex items-center justify-between bg-gray-100 border-b px-4 py-2 h-12">
    <!-- File tab -->
    <div class="flex items-center space-x-4">
      <div class="flex items-center px-3 py-1">
        <span class="text-sm font-medium">{{ editorStore.filename }}</span>
        <span v-if="editorStore.isDirty" class="ml-1 w-2 h-2 bg-orange-400 rounded-full" title="Unsaved changes" />
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex items-center space-x-2">
      <!-- Connection status indicator -->
      <div class="flex items-center px-2 py-1" :title="serialStore.isConnected ? 'Connected' : 'Disconnected'">
        <div class="w-2 h-2 rounded-full" :class="serialStore.isConnected ? 'bg-green-400' : 'bg-red-400'" />
      </div>

      <!-- Connect button -->
      <button v-if="!serialStore.isConnected" @click="serialStore.connect"
        class="p-2 text-gray-600 hover:bg-blue-100 hover:text-blue-600 rounded transition-colors"
        title="Connect Device">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </button>

      <!-- Upload button -->
      <button @click="uploadCode" :disabled="!serialStore.isConnected || serialStore.isUploading"
        class="p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Upload Code">
        <ArrowUpTrayIcon class="w-4 h-4" />
      </button>

      <!-- Run button -->
      <button @click="runCode" :disabled="!serialStore.isConnected || serialStore.isUploading"
        class="p-2 text-gray-600 hover:bg-green-100 hover:text-green-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        :title="serialStore.isUploading ? 'Running...' : 'Run Code'">
        <PlayIcon class="w-4 h-4" />
      </button>

      <!-- Layout toggle -->
      <button @click="toggleOrientation"
        class="p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-800 rounded transition-colors"
        :title="`Switch to ${uiStore.splitOrientation === 'vertical' ? 'horizontal' : 'vertical'} layout`">
        <component :is="uiStore.splitOrientation === 'vertical' ? ViewColumnsIcon : Bars3Icon" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowUpTrayIcon, PlayIcon, ViewColumnsIcon, Bars3Icon } from '@heroicons/vue/24/outline'
import { useEditorStore } from '../stores/editor'
import { useSerialStore } from '../stores/serial'
import { useUIStore } from '../stores/ui'

const editorStore = useEditorStore()
const serialStore = useSerialStore()
const uiStore = useUIStore()


const runCode = async () => {
  if (!serialStore.isConnected) return

  await serialStore.uploadCode(editorStore.content, true)
  editorStore.saveFile()
}

const uploadCode = async () => {
  if (!serialStore.isConnected) return

  await serialStore.uploadCode(editorStore.content, false)
  editorStore.saveFile()
}

const toggleOrientation = () => {
  const newOrientation = uiStore.splitOrientation === 'vertical' ? 'horizontal' : 'vertical'
  uiStore.setSplitOrientation(newOrientation)
}
</script>