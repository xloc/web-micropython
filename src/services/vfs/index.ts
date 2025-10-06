/**
 * VFS main entry point and factory
 */

import { VirtualFileSystem } from './VirtualFileSystem'
import { OPFSBackend } from './backends/OPFSBackend'
import { PublicBackend } from './backends/PublicBackend'
import type { VFS } from './types'

export type { VFS, VFSFile, VFSStats, VFSBackend } from './types'

/**
 * Create and initialize the Virtual File System
 * Combines OPFS (read/write workspace) and public resources (read-only stubs)
 */
export async function createVFS(): Promise<VFS> {
  // Initialize OPFS backend
  const opfsRoot = await navigator.storage.getDirectory()
  const opfsBackend = new OPFSBackend(opfsRoot)

  // Initialize public resource backend
  const publicBackend = new PublicBackend()

  // Combine into unified VFS
  return new VirtualFileSystem(opfsBackend, publicBackend)
}
