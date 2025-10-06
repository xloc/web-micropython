import { fileExists, readTextFile, writeTextFile } from './opfs'

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

export async function ensureConfigFile(): Promise<void> {
  const exists = await fileExists(CONFIG_PATH)
  if (!exists) {
    await writeTextFile(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2))
  }
}

export async function readConfigText(): Promise<string> {
  const exists = await fileExists(CONFIG_PATH)
  if (!exists) await ensureConfigFile()
  return await readTextFile(CONFIG_PATH)
}
