import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useStorageStore = defineStore('storage', () => {
  const originRoot = ref<FileSystemDirectoryHandle | null>(null)
  const mntDir = ref<FileSystemDirectoryHandle | null>(null)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  const isSupported = computed(() => typeof navigator !== 'undefined' && !!(navigator as any).storage && typeof (navigator as any).storage.getDirectory === 'function')

  const init = async () => {
    if (initialized.value) return
    if (!isSupported.value) {
      error.value = 'OPFS not supported in this browser'
      return
    }

    try {
      const root = await (navigator as any).storage.getDirectory() as FileSystemDirectoryHandle
      originRoot.value = root
      // Ensure '/sync-root' exists (project workspace root)
      const mnt = await root.getDirectoryHandle('sync-root', { create: true })
      mntDir.value = mnt
      initialized.value = true
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      initialized.value = false
    }
  }

  return {
    // State
    originRoot,
    mntDir,
    initialized,
    isSupported,
    error,
    // Actions
    init,
  }
})
