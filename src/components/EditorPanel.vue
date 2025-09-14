<template>
  <div class="h-full w-full">
    <vue-monaco-editor v-model:value="editorStore.content" :language="editorStore.language" :options="editorOptions"
      @mount="handleEditorMount" @change="handleContentChange" class="h-full" />

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useEditorStore } from '../stores/editor'
import { useSerialStore } from '../stores/serial'
import { usePyodideStore } from '../stores/pyodide'
import * as monaco from 'monaco-editor'
import type { editor } from 'monaco-editor'

const editorStore = useEditorStore()
const serialStore = useSerialStore()
const pyodideStore = usePyodideStore()

const editorInstance = ref<editor.IStandaloneCodeEditor | null>(null)

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

  // Log editor info for debugging
  const model = editor.getModel()
  console.log('Editor mounted with model:', {
    languageId: model?.getLanguageId(),
    uri: model?.uri.toString(),
    content: model?.getValue()
  })

  // Store-based language service registration happens automatically
  console.log('✅ Editor mounted, language features will be registered automatically')

  // Add custom keyboard shortcuts
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR, runCode)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, uploadCode)

  // Focus the editor
  editor.focus()
}

const handleContentChange = async () => {
  editorStore.updateContent(editorStore.content)

  // Sync content to Pyodide file system
  if (pyodideStore.pyodide && pyodideStore.editingFilePath) {
    await pyodideStore.pyodide.writeFile(pyodideStore.editingFilePath, editorStore.content)
  }
}

const runCode = async () => {
  if (!serialStore.isConnected) {
    console.warn('No serial connection available')
    return
  }

  await serialStore.uploadCode(editorStore.content, true)
  editorStore.saveFile()
}

const uploadCode = async () => {
  if (!serialStore.isConnected) {
    console.warn('No serial connection available')
    return
  }

  await serialStore.uploadCode(editorStore.content, false)
  editorStore.saveFile()
}

// Set initial content if empty and set initial file path for Pyodide
onMounted(() => {
  if (!editorStore.content) {
    editorStore.updateContent('s = "hello"\ns.')
  }
  // Set initial file path for the Pyodide store
  if (!pyodideStore.editingFilePath) {
    pyodideStore.editingFilePath = '/mnt/main.py'
  }
})

</script>