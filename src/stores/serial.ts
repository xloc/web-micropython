import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useSerialStore = defineStore('serial', () => {
  // State
  const port = ref<SerialPort | null>(null)
  const isConnected = ref(false)
  const isUploading = ref(false)
  const isRawMode = ref(false)
  const userInputEnabled = ref(true)
  
  // Callback for handling received data
  let onDataReceived: ((data: string) => void) | null = null

  // Keep track of the reader for proper cleanup
  let currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null
  
  // Actions
  const connect = async () => {
    try {
      port.value = await navigator.serial.requestPort()
      
      await port.value.open({ 
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      })
      
      // Set DTR and RTS signals for proper MicroPython device initialization
      await port.value.setSignals({ 
        dataTerminalReady: true, 
        requestToSend: false 
      })
      
      // Small delay to let the device initialize
      await new Promise(resolve => setTimeout(resolve, 100))
      
      isConnected.value = true
      startReading()
      
      // Send initialization sequence to wake up MicroPython REPL
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Send commands directly (now that isConnected is true)
      if (!port.value.writable) {
        throw new Error('Port writable stream not available')
      }
      const writer = port.value.writable.getWriter()
      await writer.write(new TextEncoder().encode('\x03')) // Ctrl+C to interrupt
      await new Promise(resolve => setTimeout(resolve, 100))
      
      await writer.write(new TextEncoder().encode('\x04')) // Ctrl+D to soft reset
      await new Promise(resolve => setTimeout(resolve, 100))
      
      await writer.write(new TextEncoder().encode('\r\n')) // Enter for prompt
      writer.releaseLock()
      
    } catch (error) {
      console.error('Failed to connect:', error)
      isConnected.value = false
    }
  }
  
  const disconnect = async () => {
    if (port.value) {
      // Cancel the reader first if it exists
      if (currentReader) {
        try {
          await currentReader.cancel()
          currentReader = null
        } catch (error) {
          console.warn('Error canceling reader:', error)
        }
      }

      // Close the port
      try {
        await port.value.close()
      } catch (error) {
        console.warn('Error closing port:', error)
      }

      port.value = null
      isConnected.value = false
    }
  }
  
  const sendText = async (text: string) => {
    if (!port.value || !isConnected.value) {
      return
    }
    
    try {
      if (!port.value.writable) {
        throw new Error('Port writable stream not available')
      }
      const writer = port.value.writable.getWriter()
      const encoded = new TextEncoder().encode(text)
      await writer.write(encoded)
      writer.releaseLock()
    } catch (error) {
      console.error('❌ Error sending to serial port:', error)
    }
  }
  
  const enterRawMode = async () => {
    userInputEnabled.value = false
    isRawMode.value = true
    await sendText('\x01') // Ctrl+A
  }
  
  const exitRawMode = async () => {
    await sendText('\x04') // Ctrl+D
    isRawMode.value = false
    userInputEnabled.value = true
  }
  
  const uploadCode = async (code: string, executeAfterUpload = true) => {
    if (!isConnected.value) return
    
    isUploading.value = true
    
    try {
      await enterRawMode()
      await sendText(code)
      
      if (executeAfterUpload) {
        await sendText('\x04') // Execute
      }
      
      await exitRawMode()
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      isUploading.value = false
    }
  }
  
  const startReading = async () => {
    if (!port.value) {
      return
    }

    if (!port.value.readable) {
      return
    }

    const reader = port.value.readable.getReader()
    currentReader = reader

    try {
      while (true) {
        const { value, done } = await reader.read()

        if (done) {
          break
        }

        if (!value) {
          continue
        }

        const text = new TextDecoder().decode(value)
        if (onDataReceived) {
          onDataReceived(text)
        }
      }
    } catch (error) {
      // Don't log cancellation errors as they're expected during disconnect
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('❌ Reading error:', error)
        console.error('❌ Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        })
      }
    } finally {
      if (currentReader === reader) {
        currentReader = null
      }
      reader.releaseLock()
    }
  }
  
  const setDataCallback = (callback: (data: string) => void) => {
    onDataReceived = callback
  }
  
  return {
    // State
    port,
    isConnected,
    isUploading,
    isRawMode,
    userInputEnabled,
    // Actions
    connect,
    disconnect,
    sendText,
    uploadCode,
    setDataCallback
  }
})