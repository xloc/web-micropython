import { useFileSystemStore } from '../stores/fileSystem'
import { getLsp } from './manager'
import { CONFIG_PATH, readConfigText } from '../services/pyrightConfig'

// Sets up a watcher that reinitializes the LSP when pyrightconfig.json is saved.
export function initConfigWatcher() {
  const fs = useFileSystemStore()
  fs.$onAction(({ name, args, after }) => {
    if (name !== 'saveFile') return
    after(async () => {
      const path = args[0] as string
      if (path !== CONFIG_PATH) return
      try {
        const lsp = getLsp()
        const cfg = await readConfigText()
        // Gather current open files (latest content)
        const initial: Record<string, string> = {}
        for (const ofile of fs.openFilesList) {
          initial[ofile.path] = ofile.content
        }
        // Ensure config is included
        initial[CONFIG_PATH] = cfg
        await lsp.updateSettings({}, initial)
        // No throw; silent refresh
      } catch (e) {
        // LSP may not be initialized yet; ignore
      }
    })
  })
}

