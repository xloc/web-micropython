/**
 * Public Resource Backend for VFS
 * Provides read-only access to static files in /public via HTTP fetch
 */

import type { VFSBackend, VFSFile, VFSStats } from '../types'

// Vite's import.meta.glob discovers public assets at build time
const stubFiles = import.meta.glob('/public/micropython-stubs/**/*.pyi', {
  eager: true,
  as: 'url',
})
const snippetFiles = import.meta.glob('/public/snippets/**/*', {
  eager: true,
  as: 'url',
})

export class PublicBackend implements VFSBackend {
  private fileList: Set<string>
  private dirList: Set<string>

  constructor() {
    // Build file and directory lists from glob results
    this.fileList = new Set<string>()
    this.dirList = new Set<string>()

    // Convert stub glob paths to VFS paths
    // /public/micropython-stubs/machine.pyi -> /stubs/machine.pyi
    for (const globPath of Object.keys(stubFiles)) {
      const vfsPath = globPath.replace('/public/micropython-stubs', '/stubs')
      this.fileList.add(vfsPath)
      const parts = vfsPath.split('/').filter(Boolean)
      for (let i = 1; i < parts.length; i++) {
        const dirPath = '/' + parts.slice(0, i).join('/')
        this.dirList.add(dirPath)
      }
    }

    // Convert snippet glob paths to VFS paths
    // /public/snippets/python.json -> /snippets/python.json
    for (const globPath of Object.keys(snippetFiles)) {
      const vfsPath = globPath.replace('/public/snippets', '/snippets')
      this.fileList.add(vfsPath)
      const parts = vfsPath.split('/').filter(Boolean)
      for (let i = 1; i < parts.length; i++) {
        const dirPath = '/' + parts.slice(0, i).join('/')
        this.dirList.add(dirPath)
      }
    }

    // Ensure top-level directories are registered
    this.dirList.add('/stubs')
    this.dirList.add('/snippets')
  }

  isReadOnly(): boolean {
    return true
  }

  canWrite(_path: string): boolean {
    return false
  }

  private toPublicUrl(path: string): string {
    // /stubs/machine.pyi -> /micropython-stubs/machine.pyi
    if (path.startsWith('/stubs/')) return path.replace('/stubs', '/micropython-stubs')
    // /snippets/python.json -> /snippets/python.json
    if (path.startsWith('/snippets/')) return path
    return path
  }

  async exists(path: string): Promise<boolean> {
    return this.fileList.has(path) || this.dirList.has(path)
  }

  async stat(path: string): Promise<VFSStats> {
    if (!await this.exists(path)) {
      throw new Error(`File not found: ${path}`)
    }

    // For directories
    if (this.dirList.has(path)) {
      return {
        size: 0,
        lastModified: new Date(),
        readonly: true,
      }
    }

    // For files - we don't know size without fetching
    // Return placeholder stats
    return {
      size: 0,
      lastModified: new Date(),
      readonly: true,
    }
  }

  async readFile(path: string): Promise<string> {
    if (!this.fileList.has(path)) {
      throw new Error(`File not found: ${path}`)
    }

    const url = this.toPublicUrl(path)
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.statusText}`)
    }

    return await response.text()
  }

  async readdir(path: string): Promise<VFSFile[]> {
    if (!this.dirList.has(path) && path !== '/stubs' && path !== '/snippets') {
      throw new Error(`Directory not found: ${path}`)
    }

    const entries: VFSFile[] = []
    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path

    // Find immediate children
    const children = new Set<string>()

    for (const filePath of this.fileList) {
      if (
        filePath.startsWith(normalizedPath + '/') ||
        (normalizedPath === '/stubs' && filePath.startsWith('/stubs/')) ||
        (normalizedPath === '/snippets' && filePath.startsWith('/snippets/'))
      ) {
        const relative = filePath.slice(normalizedPath.length + 1)
        const parts = relative.split('/')

        if (parts.length === 1) {
          // Direct child file
          children.add(filePath)
        } else if (parts.length > 1) {
          // Child directory
          const childDir = normalizedPath + '/' + parts[0]
          children.add(childDir)
        }
      }
    }

    for (const childPath of children) {
      const name = childPath.split('/').pop() || ''
      const isFile = this.fileList.has(childPath)

      entries.push({
        name,
        path: childPath,
        type: isFile ? 'file' : 'directory',
        size: 0,
        lastModified: new Date(),
        readonly: true,
      })
    }

    return entries
  }

  async writeFile(_path: string, _content: string): Promise<void> {
    throw new Error('Cannot write to read-only filesystem')
  }

  async deleteFile(_path: string): Promise<void> {
    throw new Error('Cannot delete from read-only filesystem')
  }

  async mkdir(_path: string): Promise<void> {
    throw new Error('Cannot create directory in read-only filesystem')
  }

  async rmdir(_path: string, _recursive?: boolean): Promise<void> {
    throw new Error('Cannot remove directory from read-only filesystem')
  }
}
