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
import * as monaco from 'monaco-editor'
import type { editor } from 'monaco-editor'

const editorStore = useEditorStore()
const serialStore = useSerialStore()

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

const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
  editorInstance.value = editor

  // Add custom keyboard shortcuts
  editor.addCommand(
    editor.getModel()?.getLanguageId() === 'python'
      ? monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR
      : 0,
    () => {
      // Run code (upload and execute)
      runCode()
    }
  )

  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU,
    () => {
      // Upload code only
      uploadCode()
    }
  )

  // Focus the editor
  editor.focus()
}

const handleContentChange = () => {
  editorStore.updateContent(editorStore.content)
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

// Set initial content if empty
onMounted(() => {
  if (!editorStore.content) {
    editorStore.updateContent('# MicroPython code\nprint("Hello, World!")')
  }
})
</script>