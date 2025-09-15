import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { usePyodideStore } from './pyodide'
import type { FileSystemEntry } from '../workers/pyodide.types'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  lastModified: Date
  children?: FileNode[]
  isExpanded?: boolean
}

export interface OpenFile {
  path: string
  content: string
  isDirty: boolean
  lastSaved: Date
}

export const useFileSystemStore = defineStore('fileSystem', () => {
  const pyodideStore = usePyodideStore()

  // State
  const projectRoot = ref('/mnt')
  const fileTree = ref<FileNode | null>(null)
  const openFiles = ref(new Map<string, OpenFile>())
  const activeFilePath = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const activeFile = computed(() =>
    activeFilePath.value ? openFiles.value.get(activeFilePath.value) : null
  )

  const dirtyFiles = computed(() =>
    Array.from(openFiles.value.values()).filter(file => file.isDirty)
  )

  const openFilesList = computed(() =>
    Array.from(openFiles.value.values())
  )

  // Helper function to convert FileSystemEntry to FileNode
  const convertToFileNode = (entry: FileSystemEntry & { children?: FileSystemEntry[] }): FileNode => {
    const node: FileNode = {
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size,
      lastModified: new Date(entry.lastModified * 1000), // Convert from Unix timestamp
      isExpanded: false
    }

    if (entry.children) {
      node.children = entry.children.map(convertToFileNode)
    }

    return node
  }

  // Actions
  const loadFileTree = async (path = projectRoot.value) => {
    if (!pyodideStore.pyodide) {
      error.value = 'Pyodide not initialized'
      return
    }

    isLoading.value = true
    error.value = null

    try {
      const tree = await pyodideStore.pyodide.getFileTree(path)
      fileTree.value = convertToFileNode(tree)
    } catch (e: any) {
      error.value = `Failed to load file tree: ${e.message}`
      console.error('Failed to load file tree:', e)
    } finally {
      isLoading.value = false
    }
  }

  const openFile = async (path: string) => {
    if (!pyodideStore.pyodide) {
      error.value = 'Pyodide not initialized'
      return
    }

    // If file is already open, just switch to it
    if (openFiles.value.has(path)) {
      activeFilePath.value = path
      return
    }

    try {
      const content = await pyodideStore.pyodide.readFile(path)
      if (content !== null) {
        openFiles.value.set(path, {
          path,
          content,
          isDirty: false,
          lastSaved: new Date()
        })
        activeFilePath.value = path
      } else {
        error.value = `Failed to read file: ${path}`
      }
    } catch (e: any) {
      error.value = `Failed to open file: ${e.message}`
      console.error('Failed to open file:', e)
    }
  }

  const closeFile = (path: string) => {
    openFiles.value.delete(path)

    // If this was the active file, switch to another open file or null
    if (activeFilePath.value === path) {
      const remainingFiles = Array.from(openFiles.value.keys())
      activeFilePath.value = remainingFiles.length > 0 ? remainingFiles[0] : null
    }
  }

  const saveFile = async (path: string) => {
    if (!pyodideStore.pyodide) {
      error.value = 'Pyodide not initialized'
      return
    }

    const file = openFiles.value.get(path)
    if (!file) {
      error.value = `File not found in open files: ${path}`
      return
    }

    try {
      await pyodideStore.pyodide.writeFile(path, file.content)
      file.isDirty = false
      file.lastSaved = new Date()
    } catch (e: any) {
      error.value = `Failed to save file: ${e.message}`
      console.error('Failed to save file:', e)
    }
  }

  const saveAllFiles = async () => {
    const promises = dirtyFiles.value.map(file => saveFile(file.path))
    await Promise.all(promises)
  }

  const updateFileContent = (path: string, content: string) => {
    const file = openFiles.value.get(path)
    if (file) {
      file.content = content
      file.isDirty = true
    }
  }

  const createFile = async (dirPath: string, filename: string) => {
    if (!pyodideStore.pyodide) {
      error.value = 'Pyodide not initialized'
      return
    }

    const fullPath = `${dirPath}/${filename}`

    try {
      await pyodideStore.pyodide.writeFile(fullPath, '')
      await loadFileTree() // Refresh tree
      await openFile(fullPath)
    } catch (e: any) {
      error.value = `Failed to create file: ${e.message}`
      console.error('Failed to create file:', e)
    }
  }

  const createDirectory = async (parentPath: string, dirName: string) => {
    if (!pyodideStore.pyodide) {
      error.value = 'Pyodide not initialized'
      return
    }

    const fullPath = `${parentPath}/${dirName}`

    try {
      await pyodideStore.pyodide.createDirectory(fullPath)
      await loadFileTree() // Refresh tree
    } catch (e: any) {
      error.value = `Failed to create directory: ${e.message}`
      console.error('Failed to create directory:', e)
    }
  }

  const deleteFile = async (path: string) => {
    if (!pyodideStore.pyodide) {
      error.value = 'Pyodide not initialized'
      return
    }

    try {
      await pyodideStore.pyodide.deleteFile(path)
      closeFile(path) // Close if open
      await loadFileTree() // Refresh tree
    } catch (e: any) {
      error.value = `Failed to delete file: ${e.message}`
      console.error('Failed to delete file:', e)
    }
  }

  const deleteDirectory = async (path: string) => {
    if (!pyodideStore.pyodide) {
      error.value = 'Pyodide not initialized'
      return
    }

    try {
      await pyodideStore.pyodide.deleteDirectory(path)

      // Close any open files in this directory
      for (const filePath of openFiles.value.keys()) {
        if (filePath.startsWith(path + '/')) {
          closeFile(filePath)
        }
      }

      await loadFileTree() // Refresh tree
    } catch (e: any) {
      error.value = `Failed to delete directory: ${e.message}`
      console.error('Failed to delete directory:', e)
    }
  }

  const renameEntry = async (oldPath: string, newPath: string) => {
    if (!pyodideStore.pyodide) {
      error.value = 'Pyodide not initialized'
      return
    }

    try {
      await pyodideStore.pyodide.renameEntry(oldPath, newPath)

      // If the renamed item was a file that's open, update the path
      if (openFiles.value.has(oldPath)) {
        const file = openFiles.value.get(oldPath)!
        openFiles.value.delete(oldPath)
        file.path = newPath
        openFiles.value.set(newPath, file)

        if (activeFilePath.value === oldPath) {
          activeFilePath.value = newPath
        }
      }

      await loadFileTree() // Refresh tree
    } catch (e: any) {
      error.value = `Failed to rename: ${e.message}`
      console.error('Failed to rename:', e)
    }
  }

  const clearError = () => {
    error.value = null
  }

  return {
    // State
    projectRoot,
    fileTree,
    openFiles: openFiles as any, // Make it readonly for external access
    activeFilePath,
    activeFile,
    dirtyFiles,
    openFilesList,
    isLoading,
    error,

    // Actions
    loadFileTree,
    openFile,
    closeFile,
    saveFile,
    saveAllFiles,
    updateFileContent,
    createFile,
    createDirectory,
    deleteFile,
    deleteDirectory,
    renameEntry,
    clearError
  }
})