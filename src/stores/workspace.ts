import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useStorageStore } from './storage'
import { useLspStore } from './lsp'
import { CONFIG_PATH, ensureConfigFile } from '../services/pyrightConfig'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  lastModified: Date
  children?: FileNode[]
  isExpanded?: boolean
}

export interface OpenTab {
  path: string
  content: string
  isDirty: boolean
  lastSaved: Date
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const storage = useStorageStore()

  // State
  const projectRoot = ref('/sync-root')
  const fileTree = ref<FileNode | null>(null)
  const openTabs = ref<OpenTab[]>([])
  const activePath = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Internal types for entries from OPFS
  type EntryKind = 'file' | 'directory'
  interface FileSystemEntry {
    name: string
    path: string
    type: EntryKind
    size: number
    lastModified: number // ms since epoch
    children?: FileSystemEntry[]
  }

  // Computed
  const activeDoc = computed(() =>
    activePath.value ? openTabs.value.find(t => t.path === activePath.value) ?? null : null
  )
  const openPaths = computed(() => openTabs.value.map(t => t.path))

  // Helper function to convert FileSystemEntry to FileNode
  const convertToFileNode = (entry: FileSystemEntry & { children?: FileSystemEntry[] }): FileNode => {
    const node: FileNode = {
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size,
      lastModified: new Date(entry.lastModified),
      isExpanded: false
    }

    if (entry.children) {
      node.children = entry.children.map(convertToFileNode)
    }

    return node
  }

  // Path utilities
  const stripRoot = (path: string) => path.replace(/^\/sync-root\/?/, '')
  const split = (path: string) => stripRoot(path).split('/').filter(Boolean)
  // no join helper needed

  // Resolve directory handle for path (relative to /sync-root)
  const resolveDirectory = async (path: string, opts?: { create?: boolean }) => {
    if (!storage.initialized) await storage.init()
    if (!storage.mntDir) throw new Error('OPFS not initialized')
    const base = storage.mntDir as unknown as FileSystemDirectoryHandle
    const segs = split(path)
    let dir: FileSystemDirectoryHandle = base
    for (const seg of segs) {
      dir = await dir.getDirectoryHandle(seg, { create: !!opts?.create })
    }
    return dir
  }

  // Get parent directory handle and basename
  const getParent = async (path: string, opts?: { create?: boolean }) => {
    const segs = split(path)
    const name = segs.pop()
    const parentPath = '/' + ['sync-root', ...segs].join('/')
    const parent = await resolveDirectory(parentPath, opts)
    return { parent, name: name || '' }
  }

  const getFileHandle = async (path: string, opts?: { create?: boolean }) => {
    const { parent, name } = await getParent(path, opts)
    return parent.getFileHandle(name, { create: !!opts?.create })
  }

  // Build a FileSystemEntry from handle
  const statFromFile = async (fh: FileSystemFileHandle) => {
    const f = await fh.getFile()
    return { size: f.size, lastModified: f.lastModified }
  }

  const listDirectory = async (path: string): Promise<FileSystemEntry[]> => {
    const dir = await resolveDirectory(path)
    const entries: FileSystemEntry[] = []
    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      const fullPath = `${path}/${name}`
      if (handle.kind === 'file') {
        const { size, lastModified } = await statFromFile(handle as FileSystemFileHandle)
        entries.push({ name, path: fullPath, type: 'file', size, lastModified })
      } else {
        // Directory stats are synthetic as OPFS lacks real dir times
        entries.push({ name, path: fullPath, type: 'directory', size: 0, lastModified: Date.now() })
      }
    }
    return entries
  }

  const buildTree = async (path: string, depth = 10): Promise<FileSystemEntry> => {
    const name = path.split('/').pop() || 'sync-root'
    try {
      const dir = await resolveDirectory(path)
      const children: FileSystemEntry[] = []
      if (depth > 0) {
        for await (const [childName, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
          const childPath = `${path}/${childName}`
          if (handle.kind === 'file') {
            const { size, lastModified } = await statFromFile(handle as FileSystemFileHandle)
            children.push({ name: childName, path: childPath, type: 'file', size, lastModified })
          } else {
            const subtree = await buildTree(childPath, depth - 1)
            children.push(subtree)
          }
        }
      }
      return { name, path, type: 'directory', size: 0, lastModified: Date.now(), children }
    } catch (e: any) {
      // It's a file
      const fh = await getFileHandle(path)
      const { size, lastModified } = await statFromFile(fh)
      return { name, path, type: 'file', size, lastModified }
    }
  }

  // Actions
  const loadFileTree = async (path = projectRoot.value) => {
    loading.value = true
    error.value = null

    try {
      if (!storage.initialized) await storage.init()
      // Ensure pyrightconfig.json exists before building the tree so it shows on first load
      await ensureConfigFile()
      const tree = await buildTree(path)
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
      if (!storage.initialized) await storage.init()
      const fh = await getFileHandle(path)
      const content = await (await fh.getFile()).text()
      openTabs.value.push({
        path,
        content,
        isDirty: false,
        lastSaved: new Date()
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

    try {
      if (!storage.initialized) await storage.init()
      const fh = await getFileHandle(path, { create: true })
      const writable = await (fh as any).createWritable({ keepExistingData: false })
      await writable.write(file.content)
      await writable.close()
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
    const promises = openTabs.value.filter(f => f.isDirty).map(file => saveFile(file.path))
    await Promise.all(promises)
  }

  const updateFileContent = (path: string, content: string) => {
    const file = openTabs.value.find(t => t.path === path)
    if (file) {
      file.content = content
      file.isDirty = true
    }
  }

  const createFile = async (dirPath: string, filename: string) => {
    const fullPath = `${dirPath}/${filename}`

    try {
      if (!storage.initialized) await storage.init()
      const { parent, name } = await getParent(fullPath, { create: true })
      const fh = await parent.getFileHandle(name, { create: true })
      const writable = await (fh as any).createWritable({ keepExistingData: false })
      await writable.write('')
      await writable.close()
      await loadFileTree() // Refresh tree
      await openFile(fullPath)
    } catch (e: any) {
      error.value = `Failed to create file: ${e.message}`
      console.error('Failed to create file:', e)
    }
  }

  const createDirectory = async (parentPath: string, dirName: string) => {
    const fullPath = `${parentPath}/${dirName}`

    try {
      await resolveDirectory(fullPath, { create: true })
      await loadFileTree() // Refresh tree
    } catch (e: any) {
      error.value = `Failed to create directory: ${e.message}`
      console.error('Failed to create directory:', e)
    }
  }

  const deleteFile = async (path: string) => {
    try {
      const { parent, name } = await getParent(path)
      await (parent as any).removeEntry(name)
      closeFile(path) // Close if open
      await loadFileTree() // Refresh tree
    } catch (e: any) {
      error.value = `Failed to delete file: ${e.message}`
      console.error('Failed to delete file:', e)
    }
  }

  const deleteDirectory = async (path: string) => {
    try {
      const { parent, name } = await getParent(path)
      await (parent as any).removeEntry(name, { recursive: true })

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

  // Copy a path (file or directory) recursively
  const copyPath = async (src: string, dst: string) => {
    try {
      // Try treat as file first
      const srcFile = await getFileHandle(src)
      const content = await (await srcFile.getFile()).text()
      const dstFile = await getFileHandle(dst, { create: true })
      const writable = await (dstFile as any).createWritable({ keepExistingData: false })
      await writable.write(content)
      await writable.close()
      return
    } catch {
      // Not a file, assume directory
    }

    await resolveDirectory(dst, { create: true })
    const entries = await listDirectory(src)
    for (const entry of entries) {
      const childSrc = entry.path
      const childDst = `${dst}/${entry.name}`
      if (entry.type === 'file') {
        await copyPath(childSrc, childDst)
      } else {
        await copyPath(childSrc, childDst)
      }
    }
  }

  const renameEntry = async (oldPath: string, newPath: string) => {
    try {
      await copyPath(oldPath, newPath)
      // remove old
      // Try delete file first, else directory recursive
      try {
        await deleteFile(oldPath)
      } catch {
        await deleteDirectory(oldPath)
      }

      // If the renamed item was a file that's open, update the path
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
