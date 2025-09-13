<template>
  <div class="flex items-center justify-between bg-gray-100 border-b px-4 py-2 h-12">
    <!-- File tab -->
    <div class="flex items-center space-x-4">
      <div class="flex items-center bg-white rounded px-3 py-1 border">
        <span class="text-sm font-medium">{{ editorStore.filename }}</span>
        <span v-if="editorStore.isDirty" class="ml-1 w-2 h-2 bg-orange-400 rounded-full" title="Unsaved changes" />
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex items-center space-x-2">
      <!-- Connection status indicator -->
      <div class="flex items-center space-x-2 px-3 py-1 rounded text-sm" :class="connectionStatusClass">
        <div class="w-2 h-2 rounded-full" :class="serialStore.isConnected ? 'bg-green-400' : 'bg-red-400'" />
        <span>{{ serialStore.isConnected ? 'Connected' : 'Disconnected' }}</span>
      </div>

      <!-- Connect button -->
      <button v-if="!serialStore.isConnected" @click="serialStore.connect"
        class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors">
        Connect
      </button>

      <!-- Upload button -->
      <button @click="uploadCode" :disabled="!serialStore.isConnected || serialStore.isUploading"
        class="flex items-center space-x-1 px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        <ArrowUpTrayIcon class="w-4 h-4" />
        <span>Upload</span>
      </button>

      <!-- Run button -->
      <button @click="runCode" :disabled="!serialStore.isConnected || serialStore.isUploading"
        class="flex items-center space-x-1 px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        <PlayIcon class="w-4 h-4" />
        <span>{{ serialStore.isUploading ? 'Running...' : 'Run' }}</span>
      </button>

      <!-- Layout toggle -->
      <button @click="toggleOrientation"
        class="p-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
        :title="`Switch to ${uiStore.splitOrientation === 'vertical' ? 'horizontal' : 'vertical'} layout`">
        <component :is="uiStore.splitOrientation === 'vertical' ? ViewColumnsIcon : Bars3Icon" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUpTrayIcon, PlayIcon, ViewColumnsIcon, Bars3Icon } from '@heroicons/vue/24/outline'
import { useEditorStore } from '../stores/editor'
import { useSerialStore } from '../stores/serial'
import { useUIStore } from '../stores/ui'

const editorStore = useEditorStore()
const serialStore = useSerialStore()
const uiStore = useUIStore()

const connectionStatusClass = computed(() =>
  serialStore.isConnected
    ? 'bg-green-100 text-green-800'
    : 'bg-red-100 text-red-800'
)

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