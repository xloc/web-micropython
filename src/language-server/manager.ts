import { LspClient } from './LspClient'
import type { SessionOptions } from './sessionManager'
import { registerMonacoProviders, applyDiagnostics } from './monacoIntegration'
import { ensureConfigFile, readConfigText, CONFIG_PATH } from '../services/pyrightConfig'
// no type import needed; monaco instance is passed at runtime

let client: LspClient | null = null
let inited = false
let monacoInstance: (typeof import('monaco-editor')) | null = null

export async function ensureLsp(initialFiles: Record<string, string>, options?: SessionOptions, monaco?: typeof import('monaco-editor')): Promise<LspClient> {
  if (!client) {
    client = new LspClient()
  }
  if (!inited) {
    if (!monaco) throw new Error('Monaco instance is required to initialize LSP providers')
    monacoInstance = monaco
    client.requestNotification({
      onWaitingForInitialization: () => {},
      onDiagnostics: (uri, diags) => monacoInstance && applyDiagnostics(monacoInstance, uri, diags),
    })
    await ensureConfigFile()
    const cfgText = await readConfigText()
    const seeded: Record<string, string> = { ...initialFiles, [CONFIG_PATH]: cfgText }
    await client.initialize(options, seeded)
    registerMonacoProviders(monaco, client)
    inited = true
  }
  return client
}

export function getLsp(): LspClient {
  if (!client || !inited) throw new Error('LSP not initialized')
  return client
}
