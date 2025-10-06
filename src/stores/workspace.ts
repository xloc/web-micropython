import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useLspStore } from './lsp'
import { CONFIG_PATH, defaultConfig } from '../services/pyrightConfig'
import { createVFS, type VFS, type VFSFile } from '../services/vfs'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  lastModified: Date
  readonly: boolean
  children?: FileNode[]
  isExpanded?: boolean
}

export interface OpenTab {
  path: string
  content: string
  isDirty: boolean
  lastSaved: Date
  readonly: boolean
}

export const useWorkspaceStore = defineStore('workspace', () => {
  // VFS instance
  let vfs: VFS | null = null

  // State
  const projectRoot = ref('/')
  const fileTree = ref<FileNode | null>(null)
  const openTabs = ref<OpenTab[]>([])
  const activePath = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  // Computed
  const activeDoc = computed(() =>
    activePath.value ? openTabs.value.find(t => t.path === activePath.value) ?? null : null
  )
  const openPaths = computed(() => openTabs.value.map(t => t.path))

  // Helper to convert VFSFile to FileNode
  const convertToFileNode = (entry: VFSFile): FileNode => {
    const node: FileNode = {
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size,
      lastModified: entry.lastModified,
      readonly: entry.readonly,
      isExpanded: false
    }

    if (entry.children) {
      node.children = entry.children.map(convertToFileNode)
    }

    return node
  }

  // Initialize VFS
  const init = async () => {
    if (initialized.value) return
    try {
      vfs = await createVFS()

      // Ensure pyrightconfig.json exists
      const configExists = await vfs.exists(CONFIG_PATH)
      if (!configExists) {
        await vfs.writeFile(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2))
      }

      initialized.value = true
    } catch (e: any) {
      error.value = `Failed to initialize VFS: ${e.message}`
      console.error('Failed to initialize VFS:', e)
      throw e
    }
  }

  // Actions
  const loadFileTree = async (path = projectRoot.value) => {
    loading.value = true
    error.value = null

    try {
      if (!vfs) await init()
      if (!vfs) throw new Error('VFS not initialized')

      const tree = await vfs.buildTree(path)
      fileTree.value = convertToFileNode(tree)
    } catch (e: any) {
      error.value = `Failed to load file tree: ${e.message}`
      console.error('Failed to load file tree:', e)
    } finally {
      loading.value = false
    }
  }

  const openFile = async (path: string) => {
    // If file is already open, just switch to it
    if (openTabs.value.some(t => t.path === path)) {
      activePath.value = path
      return
    }

    try {
      if (!vfs) await init()
      if (!vfs) throw new Error('VFS not initialized')

      const content = await vfs.readFile(path)
      const isReadOnly = vfs.isReadOnly(path)

      openTabs.value.push({
        path,
        content,
        isDirty: false,
        lastSaved: new Date(),
        readonly: isReadOnly
      })
      activePath.value = path
    } catch (e: any) {
      error.value = `Failed to open file: ${e.message}`
      console.error('Failed to open file:', e)
    }
  }

  const closeFile = (path: string) => {
    const idx = openTabs.value.findIndex(t => t.path === path)
    if (idx !== -1) openTabs.value.splice(idx, 1)

    // If this was the active file, switch to another open file or null
    if (activePath.value === path) {
      activePath.value = openTabs.value.length > 0 ? openTabs.value[0].path : null
    }
  }

  const saveFile = async (path: string) => {
    const file = openTabs.value.find(t => t.path === path)
    if (!file) {
      error.value = `File not found in open files: ${path}`
      return
    }

    if (file.readonly) {
      error.value = `Cannot save read-only file: ${path}`
      return
    }

    try {
      if (!vfs) throw new Error('VFS not initialized')

      await vfs.writeFile(path, file.content)
      file.isDirty = false
      file.lastSaved = new Date()

      // If pyrightconfig.json was saved, refresh LSP settings with current open docs
      if (path === CONFIG_PATH) {
        try {
          const lsp = useLspStore()
          const initial: Record<string, string> = {}
          for (const t of openTabs.value) {
            initial[t.path] = t.content
          }
          initial[CONFIG_PATH] = file.content
          await lsp.updateSettings({}, initial)
        } catch {
          // LSP may not be initialized; ignore
        }
      }
    } catch (e: any) {
      error.value = `Failed to save file: ${e.message}`
      console.error('Failed to save file:', e)
    }
  }

  const saveAllFiles = async () => {
    const promises = openTabs.value
      .filter(f => f.isDirty && !f.readonly)
      .map(file => saveFile(file.path))
    await Promise.all(promises)
  }

  const updateFileContent = (path: string, content: string) => {
    const file = openTabs.value.find(t => t.path === path)
    if (file && !file.readonly) {
      file.content = content
      file.isDirty = true
    }
  }

  const createFile = async (dirPath: string, filename: string) => {
    const fullPath = `${dirPath}/${filename}`.replace(/\/+/g, '/')

    try {
      if (!vfs) await init()
      if (!vfs) throw new Error('VFS not initialized')

      await vfs.writeFile(fullPath, '')
      await loadFileTree() // Refresh tree
      await openFile(fullPath)
    } catch (e: any) {
      error.value = `Failed to create file: ${e.message}`
      console.error('Failed to create file:', e)
    }
  }

  const createDirectory = async (parentPath: string, dirName: string) => {
    const fullPath = `${parentPath}/${dirName}`.replace(/\/+/g, '/')

    try {
      if (!vfs) await init()
      if (!vfs) throw new Error('VFS not initialized')

      await vfs.mkdir(fullPath)
      await loadFileTree() // Refresh tree
    } catch (e: any) {
      error.value = `Failed to create directory: ${e.message}`
      console.error('Failed to create directory:', e)
    }
  }

  const deleteFile = async (path: string) => {
    try {
      if (!vfs) throw new Error('VFS not initialized')

      await vfs.deleteFile(path)
      closeFile(path) // Close if open
      await loadFileTree() // Refresh tree
    } catch (e: any) {
      error.value = `Failed to delete file: ${e.message}`
      console.error('Failed to delete file:', e)
    }
  }

  const deleteDirectory = async (path: string) => {
    try {
      if (!vfs) throw new Error('VFS not initialized')

      await vfs.rmdir(path, true)

      // Close any open files in this directory
      for (const tab of [...openTabs.value]) {
        if (tab.path.startsWith(path + '/')) {
          closeFile(tab.path)
        }
      }

      await loadFileTree() // Refresh tree
    } catch (e: any) {
      error.value = `Failed to delete directory: ${e.message}`
      console.error('Failed to delete directory:', e)
    }
  }

  const renameEntry = async (oldPath: string, newPath: string) => {
    try {
      if (!vfs) throw new Error('VFS not initialized')

      // Read old content
      const isFile = await vfs.exists(oldPath)
      if (!isFile) throw new Error('Source path does not exist')

      // Determine if file or directory
      const stats = await vfs.stat(oldPath)

      // For files: copy content
      if (stats.size >= 0) {
        try {
          const content = await vfs.readFile(oldPath)
          await vfs.writeFile(newPath, content)
          await vfs.deleteFile(oldPath)
        } catch {
          // Might be a directory, try directory operations
          await vfs.mkdir(newPath)
          // Note: Full directory copy would require recursive logic
          await vfs.rmdir(oldPath, true)
        }
      }

      // Update open tabs if file was open
      const tab = openTabs.value.find(t => t.path === oldPath)
      if (tab) {
        tab.path = newPath
        if (activePath.value === oldPath) {
          activePath.value = newPath
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
    openTabs,
    activePath,
    activeDoc,
    openPaths,
    loading,
    error,
    initialized,

    // Actions
    init,
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
