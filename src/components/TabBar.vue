<template>
  <div class="flex items-center justify-between bg-zinc-800 pr-4 h-10">
    <!-- File tabs -->
    <div class="flex items-center h-full overflow-x-auto">
      <div
        v-for="file in fileSystemStore.openFilesList"
        :key="file.path"
        :class="[
          'flex items-center px-3 py-1 h-full border-r border-zinc-600 cursor-pointer hover:bg-zinc-600 transition-colors',
          {
            'bg-zinc-700': fileSystemStore.activeFilePath === file.path,
            'bg-zinc-800': fileSystemStore.activeFilePath !== file.path
          }
        ]"
        @click="switchToFile(file.path)"
      >
        <span class="text-sm font-medium pr-2 text-zinc-300">{{ getFileName(file.path) }}</span>
        <span v-if="file.isDirty" class="w-2 h-2 bg-orange-400 rounded-full" title="Unsaved changes" />
        <button
          @click.stop="closeFile(file.path)"
          class="ml-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-600 rounded p-0.5"
          title="Close"
        >
          ✕
        </button>
      </div>

      <!-- Show message if no files open -->
      <div v-if="fileSystemStore.openFilesList.length === 0" class="px-3 py-1 text-zinc-500 text-sm">
        No files open
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
import { useSerialStore } from '../stores/serial'
import { useUIStore } from '../stores/ui'
import { useFileSystemStore } from '../stores/fileSystem'

const serialStore = useSerialStore()
const uiStore = useUIStore()
const fileSystemStore = useFileSystemStore()


const switchToFile = (path: string) => {
  fileSystemStore.activeFilePath = path
}

const closeFile = (path: string) => {
  fileSystemStore.closeFile(path)
}

const getFileName = (path: string): string => {
  const parts = path.split('/')
  return parts[parts.length - 1] || ''
}

const runCode = async () => {
  if (!serialStore.isConnected) return

  const activeFile = fileSystemStore.activeFile
  if (!activeFile) return

  await serialStore.uploadCode(activeFile.content, true)
  await fileSystemStore.saveFile(activeFile.path)
}

const uploadCode = async () => {
  if (!serialStore.isConnected) return

  const activeFile = fileSystemStore.activeFile
  if (!activeFile) return

  await serialStore.uploadCode(activeFile.content, false)
  await fileSystemStore.saveFile(activeFile.path)
}

const toggleOrientation = () => {
  const newOrientation = uiStore.splitOrientation === 'vertical' ? 'horizontal' : 'vertical'
  uiStore.setSplitOrientation(newOrientation)
}
</script>