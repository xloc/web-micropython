<template>
  <div class="flex items-center justify-between bg-zinc-800 pr-4 h-10">
    <!-- File tab -->
    <div class="flex items-center space-x-4 text-zinc-300 h-full">
      <div class="flex items-center px-3 py-1 bg-zinc-700 h-full">
        <span class="text-sm font-medium pr-2">{{ editorStore.filename }}</span>
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
        class="p-1 hover:bg-white/20 text-blue-400 rounded" title="Connect Device">
        <LinkIcon class="size-4" />
      </button>

      <!-- Upload button -->
      <button @click="uploadCode" :disabled="!serialStore.isConnected || serialStore.isUploading"
        class="p-1 hover:bg-white/20 text-zinc-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Upload Code">
        <ArrowUpTrayIcon class="w-4 h-4" />
      </button>

      <!-- Run button -->
      <button @click="runCode" :disabled="!serialStore.isConnected || serialStore.isUploading"
        class="p-1 hover:bg-white/20 text-green-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        :title="serialStore.isUploading ? 'Running...' : 'Run Code'">
        <PlayIcon class="w-4 h-4" />
      </button>

      <!-- Layout toggle -->
      <button @click="toggleOrientation" class="p-1 hover:bg-white/20 text-zinc-400 rounded transition-colors"
        :title="`Switch to ${uiStore.splitOrientation === 'vertical' ? 'horizontal' : 'vertical'} layout`">
        <component :is="uiStore.splitOrientation === 'vertical' ? ViewColumnsIcon : Bars3Icon" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowUpTrayIcon, PlayIcon, ViewColumnsIcon, Bars3Icon, LinkIcon } from '@heroicons/vue/20/solid'
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