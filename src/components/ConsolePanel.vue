<template>
  <div class="h-full w-full bg-black relative">
    <div ref="terminalRef" class="h-full w-full" />
    
    <!-- Connection status overlay -->
    <div 
      v-if="!serialStore.isConnected"
      class="absolute inset-0 bg-black/80 flex items-center justify-center"
    >
      <div class="text-white text-center">
        <div class="text-lg mb-2">No Serial Connection</div>
        <button 
          @click="serialStore.connect"
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Connect Device
        </button>
      </div>
    </div>
    
    <!-- Upload indicator -->
    <div 
      v-if="serialStore.isUploading"
      class="absolute top-2 right-2 bg-yellow-600 text-white px-3 py-1 rounded text-sm"
    >
      Uploading...
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSerialStore } from '../stores/serial'

const serialStore = useSerialStore()
const terminalRef = ref<HTMLElement>()

let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null

onMounted(async () => {
  await nextTick()
  
  if (!terminalRef.value) {
    console.error('Terminal ref not available')
    return
  }
  
  // Create terminal instance
  terminal = new Terminal({
    theme: {
      background: '#000000',
      foreground: '#ffffff',
      cursor: '#ffffff'
    },
    fontSize: 14,
    fontFamily: 'Monaco, "Cascadia Code", "Roboto Mono", monospace',
    cursorBlink: true
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
  
  // Add some test content to verify terminal is working
  terminal.write('Terminal initialized. Press Connect to start.\r\n')
  
  // Set up callback for serial data
  serialStore.setDataCallback((data: string) => {
    if (terminal) {
      terminal.write(data)
    }
  })
  
  // Handle window resize
  const handleResize = () => {
    if (fitAddon) {
      setTimeout(() => fitAddon!.fit(), 100)
    }
  }
  
  window.addEventListener('resize', handleResize)
  
  // Cleanup in onUnmounted
  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
    // Clear the callback to avoid memory leaks
    serialStore.setDataCallback(() => {})
    if (terminal) {
      terminal.dispose()
    }
  })
})


// Watch user input enabled state for visual feedback
watch(() => serialStore.userInputEnabled, (enabled) => {
  if (!terminal) return
  
  // Change cursor style based on input state
  terminal.options.cursorStyle = enabled ? 'block' : 'underline'
  
  if (!enabled) {
    terminal.write('\r\n[Input disabled during upload]\r\n')
  }
})

// Auto-fit terminal when panel is resized
const resizeObserver = new ResizeObserver(() => {
  if (fitAddon) {
    setTimeout(() => fitAddon!.fit(), 50)
  }
})

onMounted(() => {
  if (terminalRef.value) {
    resizeObserver.observe(terminalRef.value)
  }
})

onUnmounted(() => {
  resizeObserver.disconnect()
})
</script>