import type { VFS } from './vfs'

export const CONFIG_PATH = '/sync-root/pyrightconfig.json'

export const defaultConfig = {
  typeshedPath: '/typeshed',
  extraPaths: ['/sync-root'],
  include: ['**/*.py', '**/*.pyi'],
  // Silence stub-only source resolution warnings (keep real missing-imports)
  reportMissingModuleSource: 'none',
  executionEnvironments: [
    { root: '/sync-root', extraPaths: ['/sync-root'] },
  ],
}

export async function ensureConfigFile(vfs: VFS): Promise<void> {
  const exists = await vfs.exists(CONFIG_PATH)
  if (!exists) {
    await vfs.writeFile(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2))
  }
}

export async function readConfigText(vfs: VFS): Promise<string> {
  const exists = await vfs.exists(CONFIG_PATH)
  if (!exists) await ensureConfigFile(vfs)
  return await vfs.readFile(CONFIG_PATH)
}
