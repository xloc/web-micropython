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

      <!-- Upload indicator -->
      <div v-if="serialStore.isUploading"
        class="absolute top-2 right-2 bg-yellow-600 text-white px-3 py-1 rounded text-sm">
        Uploading code to device...
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

const serialStore = useSerialStore()
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
  serialStore.setDataCallback(() => { })
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
  terminal.onData((data: string) => {
    if (serialStore.userInputEnabled && serialStore.isConnected) {
      serialStore.sendText(data)
    } else {
      // Echo back locally for testing when not connected
      terminal?.write(data)
    }
  })


  // Set up callback for serial data
  serialStore.setDataCallback((data: string) => {
    if (terminal) {
      terminal.write(data)
    }
  })

  // Set up callback for info messages
  serialStore.setInfoCallback((message: string) => {
    if (terminal) {
      terminal.write(`\x1b[90m${message}\x1b[0m\r\n`) // Gray text
    }
  })

  window.addEventListener('resize', handleResize)

  // Set up resize observer
  if (terminalRef.value) {
    resizeObserver.observe(terminalRef.value)
  }
})

// Watch user input enabled state for visual feedback
watch(() => serialStore.userInputEnabled, (enabled) => {
  if (!terminal) return

  // Change cursor style based on input state
  terminal.options.cursorStyle = enabled ? 'block' : 'underline'

})
</script>

<style>
.xterm .xterm-viewport {
  scrollbar-color: oklch(70.5% 0.015 286.067) transparent;
  scrollbar-width: thin;
}
</style>