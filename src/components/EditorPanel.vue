<template>
  <div class="h-full w-full flex flex-col bg-zinc-800">
    <!-- Tab bar - only show when files are open -->
    <div v-if="fileSystemStore.openFilesList.length > 0"
      class="flex items-center justify-between bg-zinc-800 pr-4 h-10">
      <!-- File tabs -->
      <div class="flex items-center h-full overflow-x-auto hide-scrollbar">
        <div v-for="file in fileSystemStore.openFilesList" :key="file.path"
          class="flex items-center px-2 py-1 h-full border-r border-zinc-800 cursor-pointer group gap-2" :class="{
            'bg-zinc-800': fileSystemStore.activeFilePath === file.path,
            'bg-zinc-700': fileSystemStore.activeFilePath !== file.path
          }" @click="switchToFile(file.path)">
          <FileIcon :fileName="getFileName(file.path)" class="size-4" />
          <span class="text-sm font-medium flex-1 truncate text-zinc-300">{{ getFileName(file.path) }}</span>

          <!-- Combined status/close area -->
          <div class="size-4 flex items-center justify-center ">
            <!-- Save status dot (shown when file is dirty and not hovering on inactive tabs) -->
            <div v-if="file.isDirty && !(fileSystemStore.activeFilePath === file.path)"
              class="flex items-center justify-center group-hover:hidden" title="Unsaved changes">
              <div class="size-2 bg-zinc-400 rounded-full" />
            </div>

            <!-- Close button (always shown for active file, shown on hover for others) -->
            <button @click.stop="closeFile(file.path)" :class="[
              'size-5 -mx-0.5 items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-600 rounded',
              fileSystemStore.activeFilePath === file.path ? 'flex' : 'hidden group-hover:flex'
            ]" title="Close">
              <XMarkIcon class="size-4" />
            </button>
          </div>
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
          <ArrowUpTrayIcon class="size-4" />
        </button>

        <!-- Run button -->
        <button @click="runCode" :disabled="!serialStore.isConnected || serialStore.isUploading"
          class="p-1 hover:bg-white/20 text-green-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :title="serialStore.isUploading ? 'Running...' : 'Run Code'">
          <PlayIcon class="size-4" />
        </button>

        <!-- Console toggle -->
        <button @click="uiStore.toggleConsole" class="p-1 hover:bg-white/20 text-zinc-400 rounded transition-colors"
          :title="uiStore.isConsoleVisible ? 'Hide Console' : 'Show Console'">
          <CommandLineIcon class="size-4" />
        </button>
      </div>
    </div>

    <!-- Editor content -->
    <div class="flex-1">
      <vue-monaco-editor v-if="fileSystemStore.activeFile" :language="editorStore.language" :options="editorOptions"
        @mount="handleEditorMount" @change="handleContentChange" class="h-full" />

      <div v-else class="h-full flex items-center justify-center text-gray-400">
        <div class="text-center">
          <p class="text-lg mb-2">No File Open</p>
          <p class="text-sm">Open a file from the explorer to start editing</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch, shallowRef } from 'vue'
import { ArrowUpTrayIcon, PlayIcon, LinkIcon, CommandLineIcon, XMarkIcon } from '@heroicons/vue/20/solid'
import { useEditorStore } from '../stores/editor'
import { useSerialStore } from '../stores/serial'
import { usePyodideStore } from '../stores/pyodide'
import { useFileSystemStore } from '../stores/fileSystem'
import { useUIStore } from '../stores/ui'
import * as monaco from 'monaco-editor'
import type { editor } from 'monaco-editor'
import FileIcon from './FileIcon.vue'

const editorStore = useEditorStore()
const serialStore = useSerialStore()
const pyodideStore = usePyodideStore()
const fileSystemStore = useFileSystemStore()
const uiStore = useUIStore()

const editorInstance = shallowRef<editor.IStandaloneCodeEditor | null>(null)

// Tab functionality
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

const editorOptions = {
  theme: 'vs-dark',
  fontSize: 14,
  fontFamily: 'Monaco, "Cascadia Code", "Roboto Mono", monospace',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  wordWrap: 'on' as const,
  lineNumbers: 'on' as const,
  glyphMargin: false,
  folding: true,
  lineDecorationsWidth: 0,
  lineNumbersMinChars: 3,
  renderLineHighlight: 'line' as const,
  contextmenu: true,
  selectOnLineNumbers: true,
  roundedSelection: false,
  readOnly: false,
  cursorStyle: 'line' as const,
  cursorBlinking: 'blink' as const,
  tabSize: 4,
  insertSpaces: true
}

const handleEditorMount = async (editor: editor.IStandaloneCodeEditor) => {
  editorInstance.value = editor
  pyodideStore.editor = editor

  // Set initial content from active file if available
  const activeFile = fileSystemStore.activeFile
  if (activeFile) {
    editor.setValue(activeFile.content)
  }

  // Store-based language service registration happens automatically

  // Add custom keyboard shortcuts
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR, runCode)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, uploadCode)

  // Focus the editor
  editor.focus()
}

const handleContentChange = (value: string) => {
  const activeFile = fileSystemStore.activeFile
  if (!activeFile) return

  // Update file system store with new content
  fileSystemStore.updateFileContent(activeFile.path, value)

  // Sync to Pyodide file system without await to prevent blocking
  if (pyodideStore.pyodide) {
    pyodideStore.pyodide.writeFile(activeFile.path, value).catch(error => {
      console.error('Error writing to Pyodide FS:', error)
    })
  }
}

const runCode = async () => {
  if (!serialStore.isConnected) {
    return
  }

  const activeFile = fileSystemStore.activeFile
  if (!activeFile) {
    return
  }

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

// Watch for file changes and update the editor content (with loop prevention)
watch(
  () => fileSystemStore.activeFile?.content,
  (newContent) => {
    if (editorInstance.value && newContent !== undefined) {
      const currentContent = editorInstance.value.getValue()
      if (currentContent !== newContent) {
        // Critical: Only update if content is actually different to prevent infinite loops
        // This is the pattern recommended for Monaco Editor + Vue 3
        editorInstance.value.setValue(newContent)
      }
    }
  }
)

// Watch for active file path changes to load initial content
watch(
  () => fileSystemStore.activeFilePath,
  (newPath) => {
    if (editorInstance.value && newPath) {
      const activeFile = fileSystemStore.activeFile
      if (activeFile) {
        // Load initial content when file changes
        editorInstance.value.setValue(activeFile.content)
      }
    }
  }
)

// Initialize with a default file if nothing is open
onMounted(async () => {
  // Wait a bit for file system to initialize
  setTimeout(async () => {
    if (fileSystemStore.openFilesList.length === 0) {
      // Create and open a default file
      await fileSystemStore.createFile('/mnt', 'main.py')
      const activeFile = fileSystemStore.activeFile
      if (activeFile) {
        fileSystemStore.updateFileContent(activeFile.path, '# Welcome to MicroPython Web IDE\nprint("Hello, World!")')
      }
    }
  }, 1000)
})

</script>

<style scoped>
.hide-scrollbar {
  /* Hide scrollbar for Webkit browsers */
  -ms-overflow-style: none;
  /* IE and Edge */
  scrollbar-width: none;
  /* Firefox */
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
  /* Webkit browsers */
}
</style>