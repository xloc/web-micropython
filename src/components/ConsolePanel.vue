<template>
  <div class="h-full w-full flex flex-col bg-zinc-900">
    <!-- Tab bar -->
    <div class="flex items-center justify-between bg-zinc-800 pr-4 h-10">
      <div class="flex items-center h-full">
        <div class="flex items-center px-3 py-1 h-full">
          <span class="text-sm font-medium text-zinc-300">Console</span>
        </div>
      </div>

      <!-- Console action buttons -->
      <div class="flex items-center space-x-2">
        <!-- Disconnect button -->
        <button v-if="serialStore.isConnected" @click="serialStore.disconnect"
          class="p-1 hover:bg-white/20 rounded transition-colors" title="Disconnect">
          <LinkSlashIcon class="size-4 text-red-400" />
        </button>
      </div>
    </div>

    <!-- Terminal content -->
    <div class="flex-1 relative p-2">
      <div ref="terminalRef" class="h-full w-full" />

      <!-- Connection status overlay -->
      <div v-if="!serialStore.isConnected" @click="serialStore.connect"
        class="absolute inset-0 bg-black/80 flex items-center justify-center cursor-pointer hover:bg-black/70 transition-colors">
        <div class="text-white text-center pointer-events-none">
          <div class="text-lg mb-2">No Serial Connection</div>
          <div class="text-sm text-gray-300">Click to connect device</div>
        </div>
      </div>

      <!-- Sync progress overlay -->
      <div v-if="syncStore.progress"
        class="absolute inset-0 bg-black/80 flex items-center justify-center">
        <div class="bg-zinc-800 rounded-lg p-6 max-w-sm w-full mx-4 border border-zinc-700">
          <div class="text-center">
            <div class="text-lg font-medium text-white mb-2">{{ syncStore.progress.operation }}</div>

            <!-- Progress bar -->
            <div class="w-full bg-zinc-700 rounded-full h-2 mb-3">
              <div
                class="bg-blue-500 h-2 rounded-full transition-all duration-300"
                :style="{ width: `${(syncStore.progress.current / syncStore.progress.total) * 100}%` }">
              </div>
            </div>

            <!-- Progress text -->
            <div class="text-sm text-zinc-300 mb-2">
              {{ syncStore.progress.current }} / {{ syncStore.progress.total }}
              <span v-if="syncStore.progress.total > 0">
                ({{ Math.round((syncStore.progress.current / syncStore.progress.total) * 100) }}%)
              </span>
            </div>

            <!-- Current file -->
            <div v-if="syncStore.progress.currentPath" class="text-xs text-zinc-400 truncate">
              {{ syncStore.progress.currentPath }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { LinkSlashIcon } from '@heroicons/vue/20/solid'
import { useSerialStore } from '../stores/serial'
import { useSyncStore } from '../stores/sync'

const serialStore = useSerialStore()
const syncStore = useSyncStore()
const shell = serialStore.getConsoleShell()
const terminalRef = ref<HTMLElement>()

let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null

// Handle window resize
const handleResize = () => {
  if (fitAddon) {
    setTimeout(() => fitAddon!.fit(), 100)
  }
}

// Auto-fit terminal when panel is resized
const resizeObserver = new ResizeObserver(() => {
  if (fitAddon) {
    setTimeout(() => fitAddon!.fit(), 50)
  }
})

// Register cleanup before any async operations
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  resizeObserver.disconnect()
  // Clear the callback to avoid memory leaks
  shell.onData(() => { })
  if (terminal) {
    terminal.dispose()
  }
})

onMounted(async () => {
  await nextTick()

  if (!terminalRef.value) {
    console.error('Terminal ref not available')
    return
  }

  // Create terminal instance
  terminal = new Terminal({
    theme: {
      background: 'oklch(21% 0.006 285.885)',
      foreground: 'oklch(92% 0.004 286.32)',
      cursor: '#ffffff',
    },
    fontSize: 14,
    fontFamily: 'Monaco, "Cascadia Code", "Roboto Mono", monospace',
  })

  // Setup fit addon
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  // Mount terminal
  terminal.open(terminalRef.value)

  // Wait for terminal to be mounted then fit
  setTimeout(() => {
    if (fitAddon) {
      fitAddon.fit()
    }
  }, 100)

  // Handle user input
  terminal.onData(async (data: string) => {
    if (serialStore.isConnected && !serialStore.busy) {
      await shell.send(data)
    } else {
      // Echo back locally for testing when not connected or paused
      terminal?.write(data)
    }
  })


  // Wire console shell data
  shell.onData((data: string) => {
    if (terminal) terminal.write(data)
  })

  window.addEventListener('resize', handleResize)

  // Set up resize observer
  if (terminalRef.value) {
    resizeObserver.observe(terminalRef.value)
  }
})

// Watch busy state for visual feedback
watch(() => serialStore.busy, (b) => {
  if (!terminal) return

  // Change cursor style based on input state
  terminal.options.cursorStyle = b ? 'underline' : 'block'

})
</script>

<style>
.xterm .xterm-viewport {
  scrollbar-color: oklch(70.5% 0.015 286.067) transparent;
  scrollbar-width: thin;
}
</style>
