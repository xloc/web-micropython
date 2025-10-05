import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWorkspaceStore } from './workspace'
import type { FileNode } from './workspace'
import { useSerialStore } from './serial'

type Phase = 'idle' | 'planning' | 'syncing' | 'done' | 'error'

interface SyncFilters {
  include: string[]
  exclude: string[]
}

interface SyncPlanFile {
  path: string
  size: number
}

interface SyncPlan {
  dirsToCreate: string[]
  filesToUpload: SyncPlanFile[]
  totalBytes: number
}

interface SyncProgress {
  current: number
  total: number
  currentPath: string
  operation: string
}

interface SyncStatus {
  phase: Phase
  error?: string
  cancelRequested?: boolean
}

interface SyncResult {
  lastSyncedAt: Date
  stats: { files: number; dirs: number; bytes: number; durationMs: number }
}

function stripRoot(path: string) {
  return path.replace(/^\/sync-root\/?/, '')
}

function escapePythonString(content: string): string {
  return content
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

function collectFiles(node: FileNode): FileNode[] {
  const files: FileNode[] = []
  const stack: FileNode[] = [node]
  while (stack.length) {
    const n = stack.pop()!
    if (n.type === 'file') files.push(n)
    if (n.children) stack.push(...n.children)
  }
  return files
}

function dirsFromFiles(files: { path: string }[]): string[] {
  const dirPaths = new Set<string>()
  for (const f of files) {
    const rel = stripRoot(f.path)
    const parts = rel.split('/')
    parts.pop() // remove filename
    let acc = ''
    for (const p of parts) {
      if (!p) continue
      acc = acc ? `${acc}/${p}` : p
      dirPaths.add(acc)
    }
  }
  return Array.from(dirPaths).sort()
}

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms))
}

export const useSyncStore = defineStore('sync', () => {
  const filters = ref<SyncFilters>({ include: [], exclude: [] })
  const plan = ref<SyncPlan>({ dirsToCreate: [], filesToUpload: [], totalBytes: 0 })
  const progress = ref<SyncProgress | null>(null)
  const status = ref<SyncStatus>({ phase: 'idle' })
  const result = ref<SyncResult | null>(null)

  const isSyncing = computed(() => progress.value !== null || status.value.phase === 'planning' || status.value.phase === 'syncing')

  const computePlan = async () => {
    const ws = useWorkspaceStore()
    if (!ws.fileTree) throw new Error('No workspace file tree')

    // Collect files from tree
    const files = collectFiles(ws.fileTree)

    // Apply filters (simple placeholder: include all if include empty)
    const filtered = files.filter(() => true)

    const dirs = dirsFromFiles(filtered)
    const uploads: SyncPlanFile[] = filtered.map((f) => ({ path: f.path, size: f.size }))
    const totalBytes = uploads.reduce((s, f) => s + (f.size || 0), 0)

    return { dirsToCreate: dirs, filesToUpload: uploads, totalBytes } as SyncPlan
  }

  const syncProject = async () => {
    const ws = useWorkspaceStore()
    const serial = useSerialStore()

    if (!serial.isConnected) {
      status.value = { phase: 'error', error: 'Not connected' }
      return
    }
    if (!ws.fileTree) {
      status.value = { phase: 'error', error: 'No files to sync' }
      return
    }

    try {
      status.value = { phase: 'planning' }
      const computed = await computePlan()
      plan.value = computed

      const totalOps = computed.dirsToCreate.length + computed.filesToUpload.length
      progress.value = { current: 0, total: totalOps, currentPath: '', operation: 'Preparing sync...' }
      status.value = { phase: 'syncing' }

      // Open exclusive session (enters raw mode)
      const session = await serial.openSession('sync')

      const started = Date.now()
      let done = 0
      let bytes = 0

      // Create directories first
      for (const dir of computed.dirsToCreate) {
        if (status.value.cancelRequested) break
        progress.value = { current: ++done, total: totalOps, currentPath: dir, operation: 'Creating directory' }
        const cmd = `\nimport os\ntry:\n    os.makedirs('${dir}', exist_ok=True)\nexcept Exception as e:\n    print('DIR_ERROR:', e)\n`
        await session.send(cmd)
        await delay(30)
      }

      // Upload files
      for (const f of computed.filesToUpload) {
        if (status.value.cancelRequested) break
        progress.value = { current: ++done, total: totalOps, currentPath: f.path, operation: 'Uploading file' }

        // Get content from open tab or read from OPFS by opening
        let content = ws.openTabs.find((t) => t.path === f.path)?.content
        if (content == null) {
          try {
            await ws.openFile(f.path)
            content = ws.openTabs.find((t) => t.path === f.path)?.content || ''
          } catch {
            content = ''
          }
        }
        const devicePath = stripRoot(f.path)
        const escaped = escapePythonString(content)
        const cmd = `\ntry:\n    with open('${devicePath}', 'w') as _f:\n        _f.write('${escaped}')\nexcept Exception as e:\n    print('FILE_ERROR:', e)\n`
        await session.send(cmd)
        bytes += new TextEncoder().encode(content).length
        await delay(30)
      }
      await session.close()

      // Done
      result.value = {
        lastSyncedAt: new Date(),
        stats: {
          files: computed.filesToUpload.length,
          dirs: computed.dirsToCreate.length,
          bytes,
          durationMs: Date.now() - started,
        },
      }
      status.value = { phase: 'done' }
    } catch (e: any) {
      status.value = { phase: 'error', error: e?.message ?? String(e) }
    } finally {
      progress.value = null
    }
  }

  const cancel = () => {
    if (status.value.phase === 'planning' || status.value.phase === 'syncing') {
      status.value.cancelRequested = true
    }
  }

  return {
    // State
    filters,
    plan,
    progress,
    status,
    result,
    // Derived
    isSyncing,
    // Actions
    computePlan,
    syncProject,
    cancel,
  }
})
