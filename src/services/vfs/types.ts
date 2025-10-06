/**
 * Virtual File System (VFS) core types and interfaces
 */

export interface VFSFile {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  lastModified: Date
  readonly: boolean
  children?: VFSFile[]
}

export interface VFSStats {
  size: number
  lastModified: Date
  readonly: boolean
}

export interface VFSBackend {
  // Core read operations
  readFile(path: string): Promise<string>
  readdir(path: string): Promise<VFSFile[]>
  stat(path: string): Promise<VFSStats>
  exists(path: string): Promise<boolean>

  // Core write operations
  writeFile(path: string, content: string): Promise<void>
  deleteFile(path: string): Promise<void>
  mkdir(path: string): Promise<void>
  rmdir(path: string, recursive?: boolean): Promise<void>

  // Metadata
  isReadOnly(): boolean
  canWrite(path: string): boolean
}

export interface VFS {
  // Core read operations
  readFile(path: string): Promise<string>
  readdir(path: string): Promise<VFSFile[]>
  stat(path: string): Promise<VFSStats>
  exists(path: string): Promise<boolean>

  // Core write operations
  writeFile(path: string, content: string): Promise<void>
  deleteFile(path: string): Promise<void>
  mkdir(path: string): Promise<void>
  rmdir(path: string, recursive?: boolean): Promise<void>

  // Utility
  buildTree(path: string, depth?: number): Promise<VFSFile>
  isReadOnly(path: string): boolean
}
