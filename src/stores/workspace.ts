import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'
import { useLspStore } from './lsp'
import { CONFIG_PATH, defaultConfig } from '../services/pyrightConfig'
import { createVFS, type VFS, type VFSFile } from '../services/vfs'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'

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
  const activePath = useLocalStorage<string | null>('workspace-active-path', null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  // LocalStorage for persisting open tab paths (content restored from VFS)
  const savedTabPaths = useLocalStorage<string[]>('workspace-open-tabs', [])

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

  const EXPORT_ROOT_DIR = 'workspace'

  // Sync open tab paths to localStorage
  watch(
    () => openTabs.value.map(t => t.path),
    (paths) => {
      savedTabPaths.value = paths
    },
    { deep: true }
  )

  // Restore tabs from localStorage
  const restoreTabsFromStorage = async () => {
    if (!vfs) return

    try {
      // Restore tabs by reopening files from VFS
      for (const path of savedTabPaths.value) {
        if (await vfs.exists(path)) {
          await openFile(path)
        }
      }

      // Restore active path if it's in the restored tabs
      if (activePath.value && !openTabs.value.some(t => t.path === activePath.value)) {
        activePath.value = null
      }
    } catch (e) {
      console.warn('Failed to restore tabs from localStorage:', e)
    }
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

      // Restore previously opened tabs
      await restoreTabsFromStorage()
    } catch (e: any) {
      error.value = `Failed to initialize VFS: ${e.message}`
      console.error('Failed to initialize VFS:', e)
      throw e
    }
  }

  const ensureVfsReady = async (): Promise<VFS> => {
    if (!vfs) await init()
    if (!vfs) throw new Error('VFS not initialized')
    return vfs
  }

  const collectWritableEntries = async (fs: VFS) => {
    const files: string[] = []
    const directories = new Set<string>()
    const stack: string[] = ['/']

    while (stack.length > 0) {
      const current = stack.pop()!
      let entries: VFSFile[]
      try {
        entries = await fs.readdir(current)
      } catch {
        continue
      }

      for (const entry of entries) {
        if (entry.readonly) continue
        if (entry.type === 'file') {
          files.push(entry.path)
        } else if (entry.type === 'directory') {
          directories.add(entry.path)
          stack.push(entry.path)
        }
      }
    }

    files.sort((a, b) => a.localeCompare(b))
    const sortedDirectories = Array.from(directories).sort((a, b) => a.localeCompare(b))

    return { files, directories: sortedDirectories }
  }

  const normalizeZipEntryPath = (entry: string): string | null => {
    if (!entry) return null
    const withoutBackslashes = entry.replace(/\\/g, '/')
    const trimmed = withoutBackslashes.replace(/^\/+/, '')
    if (!trimmed) return null
    const parts = trimmed.split('/')
    const resolved: string[] = []

    for (const part of parts) {
      if (!part || part === '.') continue
      if (part === '..') {
        if (resolved.length === 0) return null
        resolved.pop()
        continue
      }
      resolved.push(part)
    }

    if (resolved.length === 0) return null
    return resolved.join('/')
  }

  const stripExportRoot = (entry: string): string | null => {
    if (!entry) return null
    const segments = entry.split('/').filter(Boolean)
    if (segments.length === 0) return null
    if (segments[0] !== EXPORT_ROOT_DIR) return entry
    if (segments.length === 1) return null
    return segments.slice(1).join('/')
  }

  const parentDirectoriesFor = (path: string): string[] => {
    const segments = path.split('/').filter(Boolean)
    const dirs: string[] = []
    let current = ''
    for (let i = 0; i < segments.length - 1; i += 1) {
      current += `/${segments[i]}`
      dirs.push(current)
    }
    return dirs
  }

  const readArchiveBytes = async (input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> => {
    if (input instanceof Uint8Array) return input
    if (input instanceof ArrayBuffer) return new Uint8Array(input)
    if (input instanceof Blob) {
      const buffer = await input.arrayBuffer()
      return new Uint8Array(buffer)
    }
    throw new Error('Unsupported archive input type')
  }

  const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
    const { buffer, byteOffset, byteLength } = bytes

    if (typeof ArrayBuffer !== 'undefined' && buffer instanceof ArrayBuffer) {
      if (byteOffset === 0 && byteLength === buffer.byteLength) {
        return buffer
      }
      return buffer.slice(byteOffset, byteOffset + byteLength)
    }

    const copy = new Uint8Array(byteLength)
    copy.set(bytes)
    return copy.buffer
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

  // Open an in-memory file (e.g., stub files) that isn't in the VFS
  const openInMemoryFile = (path: string, content: string, readonly = true) => {
    // If file is already open, just switch to it
    if (openTabs.value.some(t => t.path === path)) {
      activePath.value = path
      return
    }

    openTabs.value.push({
      path,
      content,
      isDirty: false,
      lastSaved: new Date(),
      readonly
    })
    activePath.value = path
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

      // If pyrightconfig.json was saved, refresh LSP settings
      if (path === CONFIG_PATH) {
        try {
          const lsp = useLspStore()
          await lsp.updateSettings({})
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

  const dumpZip = async (): Promise<Blob> => {
    try {
      const fs = await ensureVfsReady()
      const { files, directories } = await collectWritableEntries(fs)
      const archiveEntries: Record<string, Uint8Array> = {}
      const rootPrefix = `${EXPORT_ROOT_DIR}/`

      // Ensure root folder is present so unzip keeps everything contained
      archiveEntries[rootPrefix] = new Uint8Array(0)

      for (const dirPath of directories) {
        const relative = dirPath.replace(/^\//, '')
        if (!relative) continue
        const normalized = relative.replace(/\/+$/, '')
        if (!normalized) continue
        const key = `${rootPrefix}${normalized}/`
        archiveEntries[key] = new Uint8Array(0)
      }

      const fileContents = await Promise.all(
        files.map(async (path) => ({
          path,
          data: strToU8(await fs.readFile(path)),
        }))
      )

      for (const { path, data } of fileContents) {
        const relative = path.replace(/^\//, '')
        if (!relative) continue
        archiveEntries[`${rootPrefix}${relative}`] = data
      }

      const zipped = zipSync(archiveEntries, { level: 6 })
      return new Blob([toArrayBuffer(zipped)], { type: 'application/zip' })
    } catch (e: any) {
      const message = e?.message ?? String(e)
      error.value = `Failed to export workspace: ${message}`
      console.error('Failed to export workspace:', e)
      throw e
    }
  }

  const loadZip = async (archive: Blob | ArrayBuffer | Uint8Array) => {
    try {
      const fs = await ensureVfsReady()
      const bytes = await readArchiveBytes(archive)
      let unpacked: Record<string, Uint8Array>

      try {
        unpacked = unzipSync(bytes)
      } catch (e: any) {
        throw new Error(`Invalid archive: ${e?.message ?? String(e)}`)
      }

      const directoriesToEnsure = new Set<string>()
      const filesToWrite: Array<{ path: string; content: string }> = []

      for (const rawPath of Object.keys(unpacked)) {
        const normalized = normalizeZipEntryPath(rawPath)
        if (!normalized) continue

        const stripped = stripExportRoot(normalized)
        if (!stripped) continue

        const absolutePath = `/${stripped}`
        const isDirectory = rawPath.endsWith('/')

        if (isDirectory) {
          if (!fs.isReadOnly(absolutePath)) {
            directoriesToEnsure.add(absolutePath)
          }
          continue
        }

        if (fs.isReadOnly(absolutePath)) {
          continue
        }

        for (const dir of parentDirectoriesFor(absolutePath)) {
          if (!fs.isReadOnly(dir)) {
            directoriesToEnsure.add(dir)
          }
        }

        const content = strFromU8(unpacked[rawPath])
        filesToWrite.push({ path: absolutePath, content })
      }

      // Ensure directories exist before writing files
      const orderedDirectories = Array.from(directoriesToEnsure).sort((a, b) => a.localeCompare(b))
      for (const dir of orderedDirectories) {
        if (!dir || dir === '/') continue
        try {
          await fs.mkdir(dir)
        } catch {
          // Directory may already exist; ignore
        }
      }

      const importedContent = new Map<string, string>()
      for (const file of filesToWrite.sort((a, b) => a.path.localeCompare(b.path))) {
        await fs.writeFile(file.path, file.content)
        importedContent.set(file.path, file.content)
      }

      // Refresh existing open tabs that were overwritten
      for (const tab of openTabs.value) {
        const updatedContent = importedContent.get(tab.path)
        if (updatedContent != null && !tab.readonly) {
          tab.content = updatedContent
          tab.isDirty = false
          tab.lastSaved = new Date()
        }
      }

      await loadFileTree()
    } catch (e: any) {
      const message = e?.message ?? String(e)
      error.value = `Failed to import workspace: ${message}`
      console.error('Failed to import workspace:', e)
      throw e
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
    openInMemoryFile,
    closeFile,
    saveFile,
    saveAllFiles,
    updateFileContent,
    createFile,
    createDirectory,
    deleteFile,
    deleteDirectory,
    renameEntry,
    dumpZip,
    loadZip,
    clearError
  }
})
