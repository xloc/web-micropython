import { defineStore } from 'pinia'
import { shallowRef, ref } from 'vue'
import { LspClient } from '../language-server/LspClient'
import type { SessionOptions } from '../language-server/sessionManager'
import { registerMonacoProviders, applyDiagnostics } from '../language-server/monacoIntegration'

type Phase = 'idle' | 'initializing' | 'providers' | 'ready' | 'error'

export const useLspStore = defineStore('lsp', () => {
  const client = shallowRef<LspClient | null>(null)
  const phase = ref<Phase>('idle')
  const waiting = ref(false)
  const monacoAttached = ref(false)
  const lastError = ref<string | null>(null)

  let monacoInstance: typeof import('monaco-editor') | null = null

  const ensureClient = () => {
    if (!client.value) client.value = new LspClient()
    return client.value!
  }

  const init = async (initialFiles: Record<string, string>, options?: SessionOptions) => {
    try {
      phase.value = 'initializing'
      lastError.value = null
      const c = ensureClient()
      c.requestNotification({
        onWaitingForInitialization: (w) => (waiting.value = w),
        onDiagnostics: (uri, diags) => {
          if (monacoInstance) applyDiagnostics(monacoInstance, uri, diags)
        },
      })

      // initialFiles should already contain CONFIG_PATH if needed
      await c.initialize(options, initialFiles)
      phase.value = monacoAttached.value ? 'ready' : 'providers'
    } catch (e: any) {
      lastError.value = e?.message ?? String(e)
      phase.value = 'error'
    }
  }

  const attachMonaco = (monaco: typeof import('monaco-editor')) => {
    monacoInstance = monaco
    const c = ensureClient()
    registerMonacoProviders(monaco, c)
    monacoAttached.value = true
    if (phase.value !== 'error') phase.value = 'ready'
  }

  // Thin wrappers for client APIs (guard if not ready)
  const hasDocument = (uriOrPath: string) => !!client.value?.hasDocument(uriOrPath)
  const openDocument = async (uriOrPath: string, text: string) => {
    if (!client.value) return
    await client.value.openDocument(uriOrPath, text)
  }
  const changeDocument = async (uriOrPath: string, text: string) => {
    if (!client.value) return
    await client.value.changeDocument(uriOrPath, text)
  }
  const updateSettings = async (options: SessionOptions, initialFiles: Record<string, string>) => {
    if (!client.value) return
    // initialFiles should already contain CONFIG_PATH if needed
    await client.value.updateSettings(options, initialFiles)
  }

  return {
    // State
    client,
    phase,
    waiting,
    monacoAttached,
    lastError,
    // Actions
    init,
    attachMonaco,
    updateSettings,
    // Doc helpers
    hasDocument,
    openDocument,
    changeDocument,
  }
})

