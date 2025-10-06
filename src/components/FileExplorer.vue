<template>
  <div class="h-full flex flex-col group">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 h-10 bg-zinc-800">
      <h3 class="text-sm font-medium text-gray-400">Explorer</h3>
      <button
        @click="syncProject"
        :disabled="!serialStore.isConnected || syncStore.isSyncing"
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
      <div v-if="workspaceStore.loading" class="text-sm text-gray-500 p-2">
        Loading...
      </div>

      <div v-else-if="workspaceStore.error" class="text-sm text-red-600 p-2">
        Error: {{ workspaceStore.error }}
      </div>

      <div v-else-if="flattenedTree.length > 0">
        <FileTreeNode v-for="node in flattenedTree" :key="node.path" :node="node" :level="0"
          @file-click="handleFileClick" @folder-click="handleFolderClick" />
      </div>

      <div v-else class="text-sm p-2">
        No files found
      </div>
    </div>


  </div>
</template>

<script setup lang="ts">
import { watch, computed } from 'vue'
import { ArrowPathIcon, ArrowUpTrayIcon, DocumentPlusIcon, FolderPlusIcon } from '@heroicons/vue/16/solid'
import { useWorkspaceStore } from '../stores/workspace'
import { useSerialStore } from '../stores/serial'
import { useSyncStore } from '../stores/sync'
import FileTreeNode from './FileTreeNode.vue'
import type { FileNode } from '../stores/workspace'

const workspaceStore = useWorkspaceStore()
const serialStore = useSerialStore()
const syncStore = useSyncStore()

// Flatten root: show root's children directly instead of showing root folder
const flattenedTree = computed(() => {
  return workspaceStore.fileTree?.children || []
})

// Recursively find and expand nodes along a path
const expandPathInTree = (nodes: FileNode[], targetPath: string): boolean => {
  for (const node of nodes) {
    // Check if this node is on the path to the target
    if (targetPath.startsWith(node.path + '/') || targetPath === node.path) {
      if (node.type === 'directory') {
        node.isExpanded = true
        if (node.children && targetPath !== node.path) {
          expandPathInTree(node.children, targetPath)
        }
      }
      return true
    }
  }
  return false
}

// Auto-expand tree to show active file
watch(
  () => workspaceStore.activePath,
  (newPath) => {
    if (newPath && flattenedTree.value.length > 0) {
      expandPathInTree(flattenedTree.value, newPath)
    }
  }
)

// Initialize VFS and load file tree when ready
watch(
  () => workspaceStore.initialized,
  async (ready) => {
    if (ready) {
      await workspaceStore.loadFileTree()
    }
  },
  { immediate: true }
)

// Kick off VFS initialization on mount
workspaceStore.init()

const handleFileClick = async (node: FileNode) => {
  if (node.type === 'file') {
    await workspaceStore.openFile(node.path)
  }
}

const handleFolderClick = (node: FileNode) => {
  if (node.type === 'directory') {
    // Toggle expanded state
    node.isExpanded = !node.isExpanded
  }
}

const refreshFileTree = async () => {
  await workspaceStore.loadFileTree()
}

const createNewFile = async () => {
  const filename = prompt('Enter filename:')
  if (filename) {
    await workspaceStore.createFile('/sync-root', filename)
  }
}

const createNewFolder = async () => {
  const foldername = prompt('Enter folder name:')
  if (foldername) {
    await workspaceStore.createDirectory('/sync-root', foldername)
  }
}

const syncProject = async () => {
  await syncStore.syncProject()
}
</script>
