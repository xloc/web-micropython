import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useEditorStore = defineStore('editor', () => {
  // State
  const content = ref('')
  const filename = ref('main.py')
  const isDirty = ref(false)
  const language = ref('python')
  
  // Actions
  const updateContent = (newContent: string) => {
    content.value = newContent
    isDirty.value = true
  }
  
  const setFilename = (newFilename: string) => {
    filename.value = newFilename
    isDirty.value = false
  }
  
  const saveFile = () => {
    isDirty.value = false
  }
  
  const resetEditor = () => {
    content.value = ''
    filename.value = 'main.py'
    isDirty.value = false
  }
  
  return {
    // State
    content,
    filename,
    isDirty,
    language,
    // Actions
    updateContent,
    setFilename,
    saveFile,
    resetEditor
  }
})