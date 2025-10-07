/**
 * Virtual File System - combines multiple backends into a unified filesystem
 */

import type { VFS, VFSBackend, VFSFile, VFSStats } from './types'
import { OPFSBackend } from './backends/OPFSBackend'
import { PublicBackend } from './backends/PublicBackend'

export class VirtualFileSystem implements VFS {
  constructor(
    private opfsBackend: OPFSBackend,
    private publicBackend: PublicBackend
  ) {}

  /**
   * Resolve which backend handles a given path
   */
  private resolveBackend(path: string): VFSBackend {
    if (path.startsWith('/stubs/') || path === '/stubs' || path.startsWith('/snippets/') || path === '/snippets') {
      return this.publicBackend
    }
    if (path.startsWith('/sync-root/') || path === '/sync-root') {
      return this.opfsBackend
    }
    // Root path - no specific backend
    if (path === '/') {
      throw new Error('Root path requires special handling - use buildTree() or readdir()')
    }
    throw new Error(`Unknown path prefix: ${path}`)
  }

  isReadOnly(path: string): boolean {
    if (path === '/') return false
    try {
      const backend = this.resolveBackend(path)
      return backend.isReadOnly()
    } catch {
      return true
    }
  }

  async exists(path: string): Promise<boolean> {
    if (path === '/') return true
    try {
      const backend = this.resolveBackend(path)
      return await backend.exists(path)
    } catch {
      return false
    }
  }

  async stat(path: string): Promise<VFSStats> {
    if (path === '/') {
      return {
        size: 0,
        lastModified: new Date(),
        readonly: false,
      }
    }
    const backend = this.resolveBackend(path)
    return await backend.stat(path)
  }

  async readFile(path: string): Promise<string> {
    const backend = this.resolveBackend(path)
    return await backend.readFile(path)
  }

  async writeFile(path: string, content: string): Promise<void> {
    const backend = this.resolveBackend(path)
    if (!backend.canWrite(path)) {
      throw new Error(`Cannot write to read-only path: ${path}`)
    }
    return await backend.writeFile(path, content)
  }

  async deleteFile(path: string): Promise<void> {
    const backend = this.resolveBackend(path)
    if (!backend.canWrite(path)) {
      throw new Error(`Cannot delete from read-only path: ${path}`)
    }
    return await backend.deleteFile(path)
  }

  async mkdir(path: string): Promise<void> {
    const backend = this.resolveBackend(path)
    if (!backend.canWrite(path)) {
      throw new Error(`Cannot create directory in read-only path: ${path}`)
    }
    return await backend.mkdir(path)
  }

  async rmdir(path: string, recursive?: boolean): Promise<void> {
    const backend = this.resolveBackend(path)
    if (!backend.canWrite(path)) {
      throw new Error(`Cannot remove directory from read-only path: ${path}`)
    }
    return await backend.rmdir(path, recursive)
  }

  async readdir(path: string): Promise<VFSFile[]> {
    // Special case: root directory shows both mount points
    if (path === '/') {
      return [
        {
          name: 'sync-root',
          path: '/sync-root',
          type: 'directory',
          size: 0,
          lastModified: new Date(),
          readonly: false,
        },
        {
          name: 'stubs',
          path: '/stubs',
          type: 'directory',
          size: 0,
          lastModified: new Date(),
          readonly: true,
        },
        {
          name: 'snippets',
          path: '/snippets',
          type: 'directory',
          size: 0,
          lastModified: new Date(),
          readonly: true,
        },
      ]
    }

    const backend = this.resolveBackend(path)
    return await backend.readdir(path)
  }

  async buildTree(path: string, depth = 10): Promise<VFSFile> {
    // Get info about this path
    const name = path.split('/').filter(Boolean).pop() || 'root'
    const stats = await this.stat(path)

    // Base node
    const node: VFSFile = {
      name,
      path,
      type: 'directory',
      size: stats.size,
      lastModified: stats.lastModified,
      readonly: stats.readonly,
    }

    // Recursively build children if depth allows
    if (depth > 0) {
      try {
        const entries = await this.readdir(path)
        node.children = []

        for (const entry of entries) {
          if (entry.type === 'directory') {
            // Recursively build subdirectory
            const subtree = await this.buildTree(entry.path, depth - 1)
            node.children.push(subtree)
          } else {
            // Leaf file
            node.children.push(entry)
          }
        }
      } catch (e) {
        // Not a directory or error reading - no children
      }
    }

    return node
  }
}
