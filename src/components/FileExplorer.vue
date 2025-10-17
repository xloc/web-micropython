<template>
  <div class="h-full flex flex-col">
    <div v-if="workspaceStore.loading" class="text-sm text-gray-500 p-2">
      Loading...
    </div>

    <div v-else-if="workspaceStore.error" class="text-sm text-red-600 p-2">
      Error: {{ workspaceStore.error }}
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex items-center justify-between px-3 h-10 bg-zinc-800">
        <h3 class="text-sm font-medium text-gray-400">Explorer</h3>
        <div class="flex items-center gap-1">
          <button @click="syncProject" :disabled="!serialStore.isConnected || syncStore.isSyncing"
            class="p-1.5 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-gray-400 hover:text-white transition-colors"
            title="Sync to Device">
            <ArrowUpTrayIcon class="size-4" />
          </button>
          <button @click="openExplorerMenu"
            class="p-1.5 hover:bg-zinc-700 rounded text-gray-400 hover:text-white transition-colors"
            title="Workspace menu">
            <EllipsisHorizontalIcon class="size-4" />
          </button>
        </div>
      </div>

      <!-- SYNC-ROOT section -->
      <div class="bg-zinc-800 text-zinc-400 flex flex-col h-full">
        <!-- Sync Root header row with actions on the right -->
        <div class="flex items-center justify-between px-1 h-6 flex-none group">
          <button class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide select-none"
            @click="showSyncRoot = !showSyncRoot" title="Toggle sync-root section">
            <component :is="showSyncRoot ? ChevronDownIcon : ChevronRightIcon" class="size-4" />
            <span>Sync Root</span>
          </button>
          <div class="flex gap-0.5 invisible group-hover:visible">
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

        <!-- Sync Root content (flattened files) -->
        <div v-if="showSyncRoot" class="flex-1">
          <div v-if="sortedSyncRootFiles.length > 0">
            <FileTreeNode v-for="node in sortedSyncRootFiles" :key="node.path" :node="node" :level="0"
              @file-click="handleFileClick" @folder-click="handleFolderClick" />
          </div>
          <div v-else class="text-sm text-zinc-400 px-3 py-1.5">Empty</div>
        </div>

        <!-- Other header row (no actions) -->
        <div class="flex items-center justify-between px-1 h-6 border-t border-zinc-600 flex-none">
          <button class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide select-none"
            @click="showOther = !showOther" title="Toggle other section">
            <component :is="showOther ? ChevronDownIcon : ChevronRightIcon" class="size-4" />
            <span>Other</span>
          </button>
          <div class="w-6" />
        </div>

        <!-- Other content (stubs, snippets, ...) -->
        <div v-if="showOther">
          <div v-if="otherNodes.length > 0">
            <FileTreeNode v-for="node in sortedOtherNodes" :key="node.path" :node="node" :level="0"
              @file-click="handleFileClick" @folder-click="handleFolderClick" />
          </div>
          <div v-else class="text-sm text-zinc-400 px-3 py-1.5">Empty</div>
        </div>
      </div>

      <!-- File Tree -->
      <div class="flex-1 overflow-auto bg-zinc-800 text-zinc-300">
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { watch, computed } from 'vue'
import { ArrowPathIcon, ArrowUpTrayIcon, DocumentPlusIcon, FolderPlusIcon, ChevronRightIcon, ChevronDownIcon, EllipsisHorizontalIcon } from '@heroicons/vue/16/solid'
import { useWorkspaceStore } from '../stores/workspace'
import { useSerialStore } from '../stores/serial'
import { useSyncStore } from '../stores/sync'
import FileTreeNode from './FileTreeNode.vue'
import type { FileNode } from '../stores/workspace'
import { StandaloneServices } from 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices'
import { IContextMenuService } from 'monaco-editor/esm/vs/platform/contextview/browser/contextView'
import type { IContextMenuService as MonacoContextMenuService } from 'monaco-editor/esm/vs/platform/contextview/browser/contextView'
import { Action } from 'monaco-editor/esm/vs/base/common/actions'

const workspaceStore = useWorkspaceStore()
const serialStore = useSerialStore()
const syncStore = useSyncStore()

// Root children under '/'
const rootChildren = computed(() => workspaceStore.fileTree?.children || [])

// Sync-root node and its children/files
const syncRootNode = computed(() => rootChildren.value.find(n => n.path === '/sync-root'))
const syncRootFilesFlat = computed((): FileNode[] => {
  if (!syncRootNode.value || !syncRootNode.value.children) return []
  return syncRootNode.value.children
})

// All other top-level nodes (e.g., stubs, snippets, ...)
// Explicitly exclude anything under /sync-root and only show directories
const otherNodes = computed(() => rootChildren.value.filter(n => n.type === 'directory' && !n.path.startsWith('/sync-root')))

// Collapsible section state
import { ref as vueRef } from 'vue'
const showSyncRoot = vueRef(true)
const showOther = vueRef(true)

// Sorting helpers for top-level entries to match directory-first alphabetical
const sortedSyncRootFiles = computed(() => {
  return [...syncRootFilesFlat.value].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
})
const sortedOtherNodes = computed(() => {
  return [...otherNodes.value].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
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
    if (newPath && rootChildren.value.length > 0) {
      // Expand through the unified root tree; sections render same nodes
      expandPathInTree(rootChildren.value, newPath)
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

const openExplorerMenu = (event: MouseEvent) => {
  const contextMenuService = getContextMenuService()
  if (!contextMenuService) return

  const actions = buildExplorerMenuActions()
  if (actions.length === 0) return

  const button = event.currentTarget as HTMLElement | null
  const rect = button?.getBoundingClientRect()
  const anchor = rect
    ? { x: rect.left + rect.width / 2, y: rect.bottom }
    : { x: event.clientX, y: event.clientY }

  contextMenuService.showContextMenu({
    getAnchor: () => anchor,
    getActions: () => actions,
    onHide: () => button?.focus?.()
  })
}

const buildExplorerMenuActions = () => {
  return [
    new Action(
      'workspace.importZip',
      'Import Zip…',
      undefined,
      true,
      async () => {
        await handleImportWorkspace()
      }
    ),
    new Action(
      'workspace.exportZip',
      'Export Zip',
      undefined,
      true,
      async () => {
        await handleExportWorkspace()
      }
    )
  ]
}

const handleImportWorkspace = async () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.zip,application/zip'
  input.style.display = 'none'

  const cleanup = () => {
    input.value = ''
    input.remove()
    window.removeEventListener('focus', handleWindowFocus)
  }

  const handleWindowFocus = () => {
    // Give the file dialog a moment to update the input state before cleanup
    window.setTimeout(() => {
      if (!input.files || input.files.length === 0) {
        cleanup()
      }
    }, 0)
  }

  input.addEventListener(
    'change',
    async () => {
      const file = input.files?.[0]
      cleanup()

      if (!file) return

      try {
        await workspaceStore.loadZip(file)
      } catch (error) {
        console.error('Failed to import workspace zip:', error)
      }
    },
    { once: true }
  )

  window.addEventListener('focus', handleWindowFocus, { once: true })
  document.body.appendChild(input)
  input.click()
}

const handleExportWorkspace = async () => {
  try {
    const blob = await workspaceStore.dumpZip()
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = 'workspace.zip'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Failed to export workspace zip:', error)
  }
}

const getContextMenuService = (): MonacoContextMenuService | null => {
  try {
    return StandaloneServices.get<MonacoContextMenuService>(IContextMenuService)
  } catch (error) {
    console.warn('[Explorer] Monaco context menu unavailable:', error)
    return null
  }
}
</script>
