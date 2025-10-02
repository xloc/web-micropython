import { useStorageStore } from '../stores/storage'

function stripRoot(path: string) {
  return path.replace(/^\/sync-root\/?/, '')
}

async function resolveDirectory(path: string, create = false): Promise<FileSystemDirectoryHandle> {
  const storage = useStorageStore()
  if (!storage.initialized) await storage.init()
  if (!storage.mntDir) throw new Error('OPFS not initialized')
  const base = storage.mntDir as unknown as FileSystemDirectoryHandle
  const rel = stripRoot(path)
  const segs = rel.split('/').filter(Boolean)
  let dir: FileSystemDirectoryHandle = base
  for (const seg of segs) {
    dir = await dir.getDirectoryHandle(seg, { create })
  }
  return dir
}

async function getParent(path: string, create = false) {
  const rel = stripRoot(path)
  const segs = rel.split('/').filter(Boolean)
  const name = segs.pop() || ''
  const parentPath = '/' + ['sync-root', ...segs].join('/')
  const parent = await resolveDirectory(parentPath, create)
  return { parent, name }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    const { parent, name } = await getParent(path)
    await parent.getFileHandle(name, { create: false })
    return true
  } catch {
    return false
  }
}

export async function readTextFile(path: string): Promise<string> {
  const { parent, name } = await getParent(path)
  const fh = await parent.getFileHandle(name, { create: false })
  const file = await fh.getFile()
  return await file.text()
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  const { parent, name } = await getParent(path, true)
  const fh = await parent.getFileHandle(name, { create: true })
  const writable = await (fh as any).createWritable({ keepExistingData: false })
  await writable.write(content)
  await writable.close()
}
