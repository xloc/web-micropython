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

      <!-- File size for files -->
      <span v-if="node.type === 'file'" class="text-xs text-zinc-500">
        {{ formatFileSize(node.size) }}
      </span>
    </div>

    <!-- Context Menu -->
    <div v-if="showContextMenu" :style="contextMenuStyle"
      class="fixed bg-white border border-zinc-300 rounded shadow-lg py-1 z-50 min-w-32" @click.stop>
      <button @click="handleRename"
        class="w-full text-left px-3 py-1 text-sm hover:bg-zinc-100 flex items-center gap-2">
        ✏️ Rename
      </button>
      <button @click="handleDelete"
        class="w-full text-left px-3 py-1 text-sm hover:bg-zinc-100 text-red-600 flex items-center gap-2">
        🗑️ Delete
      </button>
    </div>

    <!-- Children (if directory is expanded) -->
    <div v-if="node.type === 'directory' && node.isExpanded && node.children">
      <FileTreeNode v-for="child in sortedChildren" :key="child.path" :node="child" :level="level + 1"
        @file-click="$emit('file-click', $event)" @folder-click="$emit('folder-click', $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useFileSystemStore } from '../stores/fileSystem'
import type { FileNode } from '../stores/fileSystem'
import FileIcon from './FileIcon.vue'

interface Props {
  node: FileNode
  level: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'file-click': [node: FileNode]
  'folder-click': [node: FileNode]
}>()

const fileSystemStore = useFileSystemStore()

const isActive = computed(() => {
  return props.node.type === 'file' && fileSystemStore.activeFilePath === props.node.path
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

// Context menu state
const showContextMenu = ref(false)
const contextMenuStyle = ref({})

const handleClick = () => {
  hideContextMenu()
  if (props.node.type === 'file') {
    emit('file-click', props.node)
  } else {
    emit('folder-click', props.node)
  }
}

const handleRightClick = (event: MouseEvent) => {
  event.preventDefault()
  showContextMenu.value = true

  // Position context menu at mouse position
  contextMenuStyle.value = {
    left: `${event.clientX}px`,
    top: `${event.clientY}px`
  }
}

const hideContextMenu = () => {
  showContextMenu.value = false
}

const handleRename = async () => {
  hideContextMenu()

  const currentName = props.node.name
  const newName = prompt(`Rename ${props.node.type}:`, currentName)

  if (newName && newName !== currentName && newName.trim()) {
    const parentPath = props.node.path.substring(0, props.node.path.lastIndexOf('/'))
    const newPath = `${parentPath}/${newName.trim()}`

    try {
      await fileSystemStore.renameEntry(props.node.path, newPath)
    } catch (error: any) {
      alert(`Failed to rename: ${error.message}`)
    }
  }
}

const handleDelete = async () => {
  hideContextMenu()

  try {
    if (props.node.type === 'directory') {
      await fileSystemStore.deleteDirectory(props.node.path)
    } else {
      await fileSystemStore.deleteFile(props.node.path)
    }
  } catch (error: any) {
    alert(`Failed to delete: ${error.message}`)
  }
}

// Close context menu when clicking outside
const handleClickOutside = () => {
  if (showContextMenu.value) {
    hideContextMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})


const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
</script>