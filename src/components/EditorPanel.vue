<template>
  <div class="h-full w-full flex flex-col bg-zinc-800">
    <!-- Tab bar - only show when files are open -->
    <div v-if="workspaceStore.openTabs.length > 0"
      class="flex items-center justify-between bg-zinc-800 pr-4 h-10">
      <!-- File tabs -->
      <div class="flex items-center h-full overflow-x-auto hide-scrollbar">
        <div v-for="file in workspaceStore.openTabs" :key="file.path"
          class="flex items-center px-2 py-1 h-full border-r border-zinc-800 cursor-pointer group gap-2" :class="{
            'bg-zinc-800': workspaceStore.activePath === file.path,
            'bg-zinc-700': workspaceStore.activePath !== file.path
          }" @click="switchToFile(file.path)">
          <FileIcon :fileName="getFileName(file.path)" class="size-4" />
          <span class="text-sm font-medium flex-1 truncate text-zinc-300">{{ getFileName(file.path) }}</span>

          <!-- Combined status/close area -->
          <div class="size-4 flex items-center justify-center ">
            <!-- Save status dot (shown when file is dirty and not hovering on inactive tabs) -->
            <div v-if="file.isDirty && !(workspaceStore.activePath === file.path)"
              class="flex items-center justify-center group-hover:hidden" title="Unsaved changes">
              <div class="size-2 bg-zinc-400 rounded-full" />
            </div>

            <!-- Close button (always shown for active file, shown on hover for others) -->
            <button @click.stop="closeFile(file.path)" :class="[
              'size-5 -mx-0.5 items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-600 rounded',
              workspaceStore.activePath === file.path ? 'flex' : 'hidden group-hover:flex'
            ]" title="Close">
             <XMarkIcon class="size-4" />
            </button>
          </div>
        </div>

        <!-- Show message if no files open -->
        <div v-if="workspaceStore.openTabs.length === 0" class="px-3 py-1 text-zinc-500 text-sm">
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
        <button @click="uploadCode" :disabled="!serialStore.isConnected || !!serialStore.busy"
          class="p-1 hover:bg-white/20 text-zinc-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Upload Code">
          <ArrowUpTrayIcon class="size-4" />
        </button>

        <!-- Run button -->
        <button @click="runCode" :disabled="!serialStore.isConnected || !!serialStore.busy"
          class="p-1 hover:bg-white/20 text-green-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :title="serialStore.busy ? 'Busy...' : 'Run Code'">
          <PlayIcon class="size-4" />
        </button>

        <!-- Console toggle -->
        <button @click="layoutStore.toggleConsole" class="p-1 hover:bg-white/20 text-zinc-400 rounded transition-colors"
          :title="layoutStore.consoleVisible ? 'Hide Console' : 'Show Console'">
          <CommandLineIcon class="size-4" />
        </button>
      </div>
    </div>

    <!-- Editor content -->
    <div class="flex-1">
      <vue-monaco-editor v-if="workspaceStore.activeDoc" :language="editorStore.language" :options="editorOptions"
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
import { onMounted, watch, shallowRef, ref } from 'vue'
import { ArrowUpTrayIcon, PlayIcon, LinkIcon, CommandLineIcon, XMarkIcon } from '@heroicons/vue/20/solid'
import { useEditorStore } from '../stores/editor'
import { useSerialStore } from '../stores/serial'
import { useWorkspaceStore } from '../stores/workspace'
import { useLayoutStore } from '../stores/layout'
import type { editor } from 'monaco-editor'
import { useLspStore } from '../stores/lsp'
import { toUri } from '../language-server/LspClient'
import { useMonaco } from '@guolao/vue-monaco-editor'
import FileIcon from './FileIcon.vue'

const editorStore = useEditorStore()
const serialStore = useSerialStore()
const workspaceStore = useWorkspaceStore()
const layoutStore = useLayoutStore()
const lspStore = useLspStore()

const editorInstance = shallowRef<editor.IStandaloneCodeEditor | null>(null)
const isUpdatingProgrammatically = ref(false)
const { monacoRef } = useMonaco()

// Tab functionality
const switchToFile = (path: string) => {
  workspaceStore.activePath = path
}

const closeFile = (path: string) => {
  workspaceStore.closeFile(path)
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
  if (!monacoRef.value) return;

  // Set initial content from active file if available
  const activeFile = workspaceStore.activeDoc
  if (activeFile) {
    // Initialize LSP with any open files
    const initialFiles: Record<string, string> = {}
    for (const f of workspaceStore.openTabs) {
      initialFiles[f.path] = f.content
    }
    if (Object.keys(initialFiles).length === 0) {
      initialFiles[activeFile.path] = activeFile.content
    }
    await lspStore.init(initialFiles)
    if (monacoRef.value) {
      lspStore.attachMonaco(monacoRef.value)
    }

    // Ensure a model for the active file with proper URI
    const uriStr = toUri(activeFile.path)
    const uri = (monacoRef.value).Uri.parse(uriStr)
    let model = (monacoRef.value).editor.getModel(uri)
    if (!model) {
      model = (monacoRef.value).editor.createModel(activeFile.content, editorStore.language, uri)
      if (!lspStore.hasDocument(uriStr)) {
        await lspStore.openDocument(uriStr, activeFile.content)
      }
    }
    editor.setModel(model)
  }

  // Store-based language service registration happens automatically

  // Add custom keyboard shortcuts
  const m = monacoRef.value
  editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.KeyR, runCode)
  editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyU, uploadCode)
  editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, saveCurrentFile)

  // Add blur event listener for auto-save
  editor.onDidBlurEditorText(() => {
    saveCurrentFile()
  })

  // Focus the editor
  editor.focus()
}

const handleContentChange = (value: string) => {
  // Don't mark as dirty if we're programmatically updating
  if (isUpdatingProgrammatically.value) return

  const activeFile = workspaceStore.activeDoc
  if (!activeFile) return

  // Update file system store with new content
  workspaceStore.updateFileContent(activeFile.path, value)

  // OPFS writes happen on explicit save through the store
  // Send change to LSP for current model
  try {
    const model = editorInstance.value?.getModel()
    if (model) {
      lspStore.changeDocument(model.uri.toString(), value)
    }
  } catch { }
}

const runCode = async () => {
  if (!serialStore.isConnected) return
  const activeFile = workspaceStore.activeDoc
  if (!activeFile) return

  const session = await serialStore.openSession('run')
  try {
    await session.send(activeFile.content)
  } finally {
    await session.close()
  }
  await workspaceStore.saveFile(activeFile.path)
}

const uploadCode = async () => {
  if (!serialStore.isConnected) return
  const activeFile = workspaceStore.activeDoc
  if (!activeFile) return

  const session = await serialStore.openSession('upload')
  try {
    await session.send(activeFile.content)
  } finally {
    await session.close()
  }
  await workspaceStore.saveFile(activeFile.path)
}

const saveCurrentFile = async () => {
  const activeFile = workspaceStore.activeDoc
  if (activeFile && activeFile.isDirty) {
    await workspaceStore.saveFile(activeFile.path)
  }
}

// Unified watcher: when active path or its content changes, switch model then sync content
watch(
  () => [workspaceStore.activeDoc?.path, workspaceStore.activeDoc?.content] as const,
  async ([newPath, newContent]) => {
    if (!editorInstance.value || !monacoRef.value || !newPath) return
    const activeFile = workspaceStore.activeDoc
    if (!activeFile) return

    const uriStr = toUri(activeFile.path)
    const uri = (monacoRef.value as any).Uri.parse(uriStr)
    let model = (monacoRef.value as any).editor.getModel(uri)
    if (!model) {
      model = (monacoRef.value as any).editor.createModel(activeFile.content, editorStore.language, uri)
      try {
        if (!lspStore.hasDocument(uriStr)) {
          await lspStore.openDocument(uriStr, activeFile.content)
        }
      } catch { /* LSP may not be ready; ignore */ }
    }

    const currentModel = editorInstance.value.getModel()
    if (!currentModel || currentModel.uri.toString() !== model.uri.toString()) {
      editorInstance.value.setModel(model)
    }

    if (newContent !== undefined) {
      const currentValue = model.getValue()
      if (currentValue !== newContent) {
        isUpdatingProgrammatically.value = true
        model.setValue(newContent)
        isUpdatingProgrammatically.value = false
      }
    }
  }
)

// Initialize with a default file if nothing is open
onMounted(async () => {
  // Wait a bit for file system to initialize
  setTimeout(async () => {
    if (workspaceStore.openTabs.length === 0) {
      // Create and open a default file
      await workspaceStore.createFile('/sync-root', 'main.py')
      const activeFile = workspaceStore.activeDoc
      if (activeFile) {
        workspaceStore.updateFileContent(activeFile.path, '# Welcome to MicroPython Web IDE\nprint("Hello, World!")')
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
