<template>
  <div class="h-full flex flex-col group">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 h-10 bg-zinc-800">
      <h3 class="text-sm font-medium text-gray-400">Explorer</h3>
      <button
        @click="syncProject"
        :disabled="!serialStore.isConnected || serialStore.isUploading"
        class="p-1.5 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-gray-400 hover:text-white transition-colors"
        title="Sync to Device">
        <ArrowUpTrayIcon class="size-4" />
      </button>
    </div>

    <!-- Actions -->
    <div class="bg-zinc-900 text-zinc-400 pr-3">
      <div class="flex gap-0.5 justify-end invisible group-hover:visible">
        <button @click="createNewFile" class="p-1 hover:bg-zinc-700" title="New File">
          <DocumentPlusIcon class="size-4" />
        </button>
        <button @click="createNewFolder" class="p-1 hover:bg-zinc-700" title="New Folder">
          <FolderPlusIcon class="size-4" />
        </button>
        <button @click="refreshFileTree" class="p-1 hover:bg-zinc-700" title="Refresh">
          <ArrowPathIcon class="size-4" />
        </button>
      </div>
    </div>

    <!-- File Tree -->
    <div class="flex-1 overflow-auto bg-zinc-800 text-zinc-300">
      <div v-if="fileSystemStore.isLoading" class="text-sm text-gray-500 p-2">
        Loading...
      </div>

      <div v-else-if="fileSystemStore.error" class="text-sm text-red-600 p-2">
        Error: {{ fileSystemStore.error }}
      </div>

      <div v-else-if="fileSystemStore.fileTree">
        <FileTreeNode :node="fileSystemStore.fileTree" :level="0" @file-click="handleFileClick"
          @folder-click="handleFolderClick" />
      </div>

      <div v-else class="text-sm p-2">
        No files found
      </div>
    </div>


  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { ArrowPathIcon, ArrowUpTrayIcon, DocumentPlusIcon, FolderPlusIcon } from '@heroicons/vue/16/solid'
import { useFileSystemStore } from '../stores/fileSystem'
import { useStorageStore } from '../stores/storage'
import { useSerialStore } from '../stores/serial'
import FileTreeNode from './FileTreeNode.vue'
import type { FileNode } from '../stores/fileSystem'

const fileSystemStore = useFileSystemStore()
const storageStore = useStorageStore()
const serialStore = useSerialStore()

// Initialize OPFS and load file tree when ready
watch(
  () => storageStore.initialized,
  async (ready) => {
    if (ready) {
      await fileSystemStore.loadFileTree()
    }
  },
  { immediate: true }
)

// Kick off OPFS initialization on mount
storageStore.init()

const handleFileClick = async (node: FileNode) => {
  if (node.type === 'file') {
    await fileSystemStore.openFile(node.path)
  }
}

const handleFolderClick = (node: FileNode) => {
  if (node.type === 'directory') {
    // Toggle expanded state
    node.isExpanded = !node.isExpanded
  }
}

const refreshFileTree = async () => {
  await fileSystemStore.loadFileTree()
}

const createNewFile = async () => {
  const filename = prompt('Enter filename:')
  if (filename) {
    await fileSystemStore.createFile('/mnt', filename)
  }
}

const createNewFolder = async () => {
  const foldername = prompt('Enter folder name:')
  if (foldername) {
    await fileSystemStore.createDirectory('/mnt', foldername)
  }
}

const syncProject = async () => {
  await serialStore.syncProject(fileSystemStore)
}
</script>
