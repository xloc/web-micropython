<template>
  <div class="h-full w-full flex flex-col bg-zinc-800">
    <!-- Tab bar - only show when files are open -->
    <div v-if="workspaceStore.openTabs.length > 0" class="flex items-center justify-between bg-zinc-800 pr-4 h-10">
      <!-- File tabs -->
      <div class="flex items-center h-full overflow-x-auto hide-scrollbar">
        <div v-for="file in workspaceStore.openTabs" :key="file.path"
          class="flex items-center px-2 py-1 h-full border-r border-zinc-800 cursor-pointer group gap-2" :class="{
            'bg-zinc-900': workspaceStore.activePath === file.path,
            'bg-zinc-700': workspaceStore.activePath !== file.path
          }" @click="switchToFile(file.path)">
          <FileIcon :fileName="getFileName(file.path)" class="size-4" />
          <span class="text-sm font-medium flex-1 truncate text-zinc-300">{{ getFileName(file.path) }}</span>

          <!-- Combined status/close area -->
          <div class="size-4 flex items-center justify-center ">
            <!-- Lock indicator (shown for readonly files, hidden on hover) -->
            <div v-if="file.readonly" class="flex items-center justify-center group-hover:hidden" title="Read-only">
              <LockClosedIcon class="size-3 text-zinc-400" />
            </div>

            <!-- Save status dot (shown when file is dirty and not hovering on inactive tabs) -->
            <div v-if="file.isDirty && !file.readonly && !(workspaceStore.activePath === file.path)"
              class="flex items-center justify-center group-hover:hidden" title="Unsaved changes">
              <div class="size-2 bg-zinc-400 rounded-full" />
            </div>

            <!-- Close button (for readonly: shown on hover; for normal: always shown when active, shown on hover for others) -->
            <button @click.stop="closeFile(file.path)" :class="[
              'size-5 -mx-0.5 items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-600 rounded',
              file.readonly
                ? 'hidden group-hover:flex'
                : (workspaceStore.activePath === file.path ? 'flex' : 'hidden group-hover:flex')
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
import { onMounted, onUnmounted, watch, shallowRef, ref, computed } from 'vue'
import { ArrowUpTrayIcon, PlayIcon, LinkIcon, CommandLineIcon, XMarkIcon, LockClosedIcon } from '@heroicons/vue/20/solid'
import { useEditorStore } from '../stores/editor'
import { useSerialStore } from '../stores/serial'
import { useWorkspaceStore } from '../stores/workspace'
import { useLayoutStore } from '../stores/layout'
import type { editor } from 'monaco-editor'
import { useLspStore } from '../stores/lsp'
import { toUri } from '../language-server/LspClient'
import { useMonaco } from '@guolao/vue-monaco-editor'
import { loadPythonSnippets, registerPythonSnippetProvider, SNIPPET_USER_CANDIDATES } from '../services/snippets'
import FileIcon from './FileIcon.vue'

const editorStore = useEditorStore()
const serialStore = useSerialStore()
const workspaceStore = useWorkspaceStore()
const layoutStore = useLayoutStore()
const lspStore = useLspStore()

const editorInstance = shallowRef<editor.IStandaloneCodeEditor | null>(null)
const isUpdatingProgrammatically = ref(false)
const { monacoRef } = useMonaco()
let snippetDisposable: { dispose: () => void } | null = null

// Debounce utility with saveNow functionality
const createDebouncedSave = (wait: number) => {
  let timeoutId: number | null = null

  const saveFunc = async () => {
    const activeFile = workspaceStore.activeDoc
    if (activeFile && activeFile.isDirty && !activeFile.readonly) {
      await workspaceStore.saveFile(activeFile.path)
    }
  }

  return {
    trigger() {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = null
        saveFunc()
      }, wait)
    },

    cancel() {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    },

    async saveNow() {
      this.cancel()
      await saveFunc()
    }
  }
}

// Auto-save with debounce (750ms delay)
const debouncedSave = createDebouncedSave(200)

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

const editorOptions = computed(() => ({
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
  readOnly: workspaceStore.activeDoc?.readonly ?? false,
  cursorStyle: 'line' as const,
  cursorBlinking: 'blink' as const,
  tabSize: 4,
  insertSpaces: true,
  // Snippet-related Monaco options
  snippetSuggestions: 'top' as const,
  tabCompletion: 'onlySnippets' as const,
  // Enable semantic highlighting
  'semanticHighlighting.enabled': true,
}))

const handleEditorMount = async (editor: editor.IStandaloneCodeEditor) => {
  editorInstance.value = editor
  if (!monacoRef.value) return;

  // Define custom theme with semantic token coloring rules
  monacoRef.value.editor.defineTheme('python-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      // Semantic token coloring (matching VS Code Dark+ theme)
      { token: 'class', foreground: '4EC9B0' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'method', foreground: 'DCDCAA' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'parameter', foreground: '9CDCFE' },
      { token: 'property', foreground: '9CDCFE' },
      { token: 'namespace', foreground: '4EC9B0' },
      { token: 'enum', foreground: '4EC9B0' },
      { token: 'enumMember', foreground: 'B5CEA8' },
      { token: 'typeParameter', foreground: '4EC9B0' },
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'decorator', foreground: 'DCDCAA' },
      // Custom Pyright tokens
      { token: 'selfParameter', foreground: '569CD6' },
      { token: 'clsParameter', foreground: '569CD6' },
      // Modifiers
      { token: 'builtin', foreground: '569CD6' },
    ],
    colors: {}
  })
  monacoRef.value.editor.setTheme('python-dark')

  // Set initial content from active file if available
  const activeFile = workspaceStore.activeDoc
  if (activeFile) {
    // Wait for workspace to be initialized
    if (!workspaceStore.initialized) {
      await workspaceStore.init()
    }

    // Initialize LSP with any open files including config
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

  // Load and register snippets (public + user-defined)
  try {
    const openMap: Record<string, string> = {}
    for (const t of workspaceStore.openTabs) openMap[t.path] = t.content
    const loaded = await loadPythonSnippets(openMap)
    if (snippetDisposable) { try { snippetDisposable.dispose() } catch { } }
    snippetDisposable = monacoRef.value && registerPythonSnippetProvider(monacoRef.value, loaded)
  } catch {
    // ignore snippet init errors
  }

  // Add custom keyboard shortcuts
  const m = monacoRef.value
  editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.KeyR, runCode)
  editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyU, uploadCode)
  editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, saveCurrentFile)
  // Quick reload snippets
  editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.KeyS, async () => {
    if (!monacoRef.value) return
    try {
      const openMap: Record<string, string> = {}
      for (const t of workspaceStore.openTabs) openMap[t.path] = t.content
      const loaded = await loadPythonSnippets(openMap)
      if (snippetDisposable) { try { snippetDisposable.dispose() } catch { } }
      snippetDisposable = registerPythonSnippetProvider(monacoRef.value, loaded)
    } catch { }
  })

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

  // Send change to LSP for current model
  try {
    const model = editorInstance.value?.getModel()
    if (model) {
      lspStore.changeDocument(model.uri.toString(), value)
    }
  } catch { }

  // Trigger debounced auto-save
  debouncedSave.trigger()
}

const runCode = async () => {
  if (!serialStore.isConnected) return
  const activeFile = workspaceStore.activeDoc
  if (!activeFile) return

  // Save immediately before running
  await debouncedSave.saveNow()

  const session = await serialStore.openSession('run')
  try {
    await session.send(activeFile.content)
  } finally {
    await session.close()
  }
}

const uploadCode = async () => {
  if (!serialStore.isConnected) return
  const activeFile = workspaceStore.activeDoc
  if (!activeFile) return

  // Save immediately before uploading
  await debouncedSave.saveNow()

  const session = await serialStore.openSession('upload')
  try {
    await session.send(activeFile.content)
  } finally {
    await session.close()
  }
}

const saveCurrentFile = async () => {
  // Save immediately (cancels pending debounced save)
  await debouncedSave.saveNow()
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

// Reload snippet provider when user snippet files change (live)
watch(
  () => workspaceStore.openTabs.map(t => ({ path: t.path, content: t.content })),
  async (tabs) => {
    if (!monacoRef.value) return
    const relevantChanged = tabs.some(t => SNIPPET_USER_CANDIDATES.includes(t.path))
    if (!relevantChanged) return
    try {
      const openMap: Record<string, string> = {}
      for (const t of workspaceStore.openTabs) openMap[t.path] = t.content
      const loaded = await loadPythonSnippets(openMap)
      if (snippetDisposable) { try { snippetDisposable.dispose() } catch { } }
      snippetDisposable = registerPythonSnippetProvider(monacoRef.value, loaded)
    } catch { }
  },
  { deep: true }
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
        workspaceStore.updateFileContent(activeFile.path, '# Welcome to MicroPython Web IDE\nprint("Hello, World!")\n\nfrom machine import Pin\nPin(7, Pin.OUT).on()')
      }
    }
  }, 1000)
})

onUnmounted(() => {
  // Cancel any pending auto-save
  debouncedSave.cancel()

  try { snippetDisposable?.dispose() } catch { }
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
