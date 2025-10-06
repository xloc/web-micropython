/**
 * OPFS (Origin Private File System) backend for VFS
 * Provides read/write access to browser's origin private filesystem
 */

import type { VFSBackend, VFSFile, VFSStats } from '../types'

export class OPFSBackend implements VFSBackend {
  constructor(private rootHandle: FileSystemDirectoryHandle) {}

  isReadOnly(): boolean {
    return false
  }

  canWrite(_path: string): boolean {
    return true
  }

  // Path utilities
  private stripRoot(path: string): string {
    return path.replace(/^\/sync-root\/?/, '')
  }

  private async resolveDirectory(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    const rel = this.stripRoot(path)
    const segs = rel.split('/').filter(Boolean)
    let dir: FileSystemDirectoryHandle = this.rootHandle
    for (const seg of segs) {
      dir = await dir.getDirectoryHandle(seg, { create })
    }
    return dir
  }

  private async getParent(path: string, create = false) {
    const rel = this.stripRoot(path)
    const segs = rel.split('/').filter(Boolean)
    const name = segs.pop() || ''
    const parentPath = '/' + ['sync-root', ...segs].join('/')
    const parent = await this.resolveDirectory(parentPath, create)
    return { parent, name }
  }

  private async getFileHandle(path: string, create = false): Promise<FileSystemFileHandle> {
    const { parent, name } = await this.getParent(path, create)
    return parent.getFileHandle(name, { create })
  }

  // VFSBackend implementation
  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path)
      return true
    } catch {
      return false
    }
  }

  async stat(path: string): Promise<VFSStats> {
    try {
      // Try as file first
      const fh = await this.getFileHandle(path)
      const file = await fh.getFile()
      return {
        size: file.size,
        lastModified: new Date(file.lastModified),
        readonly: false,
      }
    } catch {
      // Try as directory
      await this.resolveDirectory(path)
      return {
        size: 0,
        lastModified: new Date(),
        readonly: false,
      }
    }
  }

  async readFile(path: string): Promise<string> {
    const fh = await this.getFileHandle(path)
    const file = await fh.getFile()
    return await file.text()
  }

  async writeFile(path: string, content: string): Promise<void> {
    const fh = await this.getFileHandle(path, true)
    const writable = await (fh as any).createWritable({ keepExistingData: false })
    await writable.write(content)
    await writable.close()
  }

  async deleteFile(path: string): Promise<void> {
    const { parent, name } = await this.getParent(path)
    await (parent as any).removeEntry(name)
  }

  async mkdir(path: string): Promise<void> {
    await this.resolveDirectory(path, true)
  }

  async rmdir(path: string, recursive = false): Promise<void> {
    const { parent, name } = await this.getParent(path)
    await (parent as any).removeEntry(name, { recursive })
  }

  async readdir(path: string): Promise<VFSFile[]> {
    const dir = await this.resolveDirectory(path)
    const entries: VFSFile[] = []

    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      const fullPath = `${path}/${name}`.replace(/\/+/g, '/')

      if (handle.kind === 'file') {
        const fh = handle as FileSystemFileHandle
        const file = await fh.getFile()
        entries.push({
          name,
          path: fullPath,
          type: 'file',
          size: file.size,
          lastModified: new Date(file.lastModified),
          readonly: false,
        })
      } else {
        entries.push({
          name,
          path: fullPath,
          type: 'directory',
          size: 0,
          lastModified: new Date(),
          readonly: false,
        })
      }
    }

    return entries
  }
}
