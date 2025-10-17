<template>
  <div>
    <!-- Current Node -->
    <div class="flex items-center gap-1.5 px-1 py-0.5 text-sm cursor-pointer hover:bg-zinc-700"
      :class="{ 'bg-zinc-700': isActive }" :style="{ paddingLeft: `${level * 12 + 4}px` }" @click="handleClick"
      @contextmenu.prevent="handleRightClick">
      <!-- File/Folder Icon -->
      <div class="w-4 h-4 flex items-center justify-center">
        <FileIcon :fileName="node.name" :isFolder="node.type === 'directory'"
          :isOpen="node.type === 'directory' && node.isExpanded" class="size-4" />
      </div>

      <!-- File/Folder Name -->
      <span class="flex-1 truncate" :class="{ 'font-medium': node.type === 'directory' }">
        {{ node.name }}
      </span>

      <!-- Read-only indicator -->
      <LockClosedIcon v-if="node.readonly" class="size-4 text-zinc-500" title="Read-only" />

      <!-- File size for files (not readonly) -->
      <span v-if="node.type === 'file' && !node.readonly" class="text-xs text-zinc-500">
        {{ formatFileSize(node.size) }}
      </span>
    </div>

    <!-- Children (if directory is expanded) -->
    <div v-if="node.type === 'directory' && node.isExpanded && node.children">
      <FileTreeNode v-for="child in sortedChildren" :key="child.path" :node="child" :level="level + 1"
        @file-click="$emit('file-click', $event)" @folder-click="$emit('folder-click', $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { LockClosedIcon } from '@heroicons/vue/16/solid'
import { useWorkspaceStore } from '../stores/workspace'
import type { FileNode } from '../stores/workspace'
import FileIcon from './FileIcon.vue'
import { StandaloneServices } from 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices'
import { IContextMenuService } from 'monaco-editor/esm/vs/platform/contextview/browser/contextView'
import type { IContextMenuService as MonacoContextMenuService } from 'monaco-editor/esm/vs/platform/contextview/browser/contextView'
import { Action } from 'monaco-editor/esm/vs/base/common/actions'
import { createVFS } from '../services/vfs'

interface Props {
  node: FileNode
  level: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'file-click': [node: FileNode]
  'folder-click': [node: FileNode]
}>()

const workspaceStore = useWorkspaceStore()

const isActive = computed(() => {
  return props.node.type === 'file' && workspaceStore.activePath === props.node.path
})

const sortedChildren = computed(() => {
  if (!props.node.children) return []

  return [...props.node.children].sort((a, b) => {
    // Directories first, then files
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    // Then alphabetically
    return a.name.localeCompare(b.name)
  })
})

const handleClick = () => {
  if (props.node.type === 'file') {
    emit('file-click', props.node)
  } else {
    emit('folder-click', props.node)
  }
}

const handleRightClick = (event: MouseEvent) => {
  event.preventDefault()
  const contextMenuService = getContextMenuService()
  if (!contextMenuService) return

  const actions = buildActions()
  if (actions.length === 0) return

  const anchor = { x: event.clientX, y: event.clientY }
  const target = event.currentTarget as HTMLElement | null

  contextMenuService.showContextMenu({
    getAnchor: () => anchor,
    getActions: () => actions,
    onHide: () => target?.focus?.()
  })
}

const handleRename = async () => {
  const currentName = props.node.name
  const newName = prompt(`Rename ${props.node.type}:`, currentName)

  if (newName && newName !== currentName && newName.trim()) {
    const parentPath = props.node.path.substring(0, props.node.path.lastIndexOf('/'))
    const newPath = `${parentPath}/${newName.trim()}`

    try {
      await workspaceStore.renameEntry(props.node.path, newPath)
    } catch (error: any) {
      console.error('Failed to rename entry:', error)
    }
  }
}

const handleDelete = async () => {
  try {
    if (props.node.type === 'directory') {
      await workspaceStore.deleteDirectory(props.node.path)
    } else {
      await workspaceStore.deleteFile(props.node.path)
    }
  } catch (error: any) {
    console.error('Failed to delete entry:', error)
  }
}

const handleDownload = async () => {
  if (props.node.type !== 'file') return

  try {
    const content = await getFileContent(props.node.path)
    const blob = new Blob([content], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = props.node.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  } catch (error: any) {
    console.error('Failed to download file:', error)
  }
}

const handleCopyPath = async () => {
  try {
    await navigator.clipboard.writeText(props.node.path)
  } catch (error) {
    console.error('Failed to copy path:', error)
  }
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const getContextMenuService = (): MonacoContextMenuService | null => {
  try {
    return StandaloneServices.get<MonacoContextMenuService>(IContextMenuService)
  } catch (error) {
    console.warn('[Explorer] Monaco context menu unavailable:', error)
    return null
  }
}

const buildActions = () => {
  const actions: Action[] = []

  if (props.node.type === 'file') {
    actions.push(
      new Action(
        'explorer.download',
        'Download',
        undefined,
        true,
        async () => {
          await handleDownload()
        }
      )
    )
  }

  if (!props.node.readonly) {
    actions.push(
      new Action(
        'explorer.rename',
        'Rename',
        undefined,
        true,
        async () => {
          await handleRename()
        }
      ),
      new Action(
        'explorer.delete',
        'Delete',
        undefined,
        true,
        async () => {
          await handleDelete()
        }
      )
    )
  } else {
    actions.push(
      new Action(
        'explorer.readonly',
        'Read-only',
        undefined,
        false,
        async () => { }
      )
    )
  }

  actions.push(
    new Action(
      'explorer.copyPath',
      'Copy Path',
      undefined,
      true,
      async () => {
        await handleCopyPath()
      }
    )
  )

  return actions
}

let vfsPromise: Promise<Awaited<ReturnType<typeof createVFS>>> | null = null

const getVfs = () => {
  if (!vfsPromise) {
    vfsPromise = createVFS()
  }
  return vfsPromise
}

const getFileContent = async (path: string) => {
  const openTab = workspaceStore.openTabs.find(tab => tab.path === path)
  if (openTab) {
    return openTab.content
  }

  const vfs = await getVfs()
  return vfs.readFile(path)
}
</script>
