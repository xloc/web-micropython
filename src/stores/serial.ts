import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

type FlowControlType = 'none' | 'hardware'
type ParityType = 'none' | 'even' | 'odd'

export const useSerialStore = defineStore('serial', () => {
  // Low-level state
  const port = ref<SerialPort | null>(null)
  const settings = ref({ baudRate: 115200, dataBits: 8 as number, parity: 'none' as ParityType, stopBits: 1 as number, flowControl: 'none' as FlowControlType })
  const busy = ref<null | { reason: string; detail?: string }>(null)

  // Derived
  const isConnected = computed(() => !!port.value)

  // Data routing
  let currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let consoleOnData: ((data: string) => void) | null = null
  let sessionOnData: ((data: string) => void) | null = null
  let sessionActive = false

  const writeRaw = async (text: string) => {
    if (!port.value || !port.value.writable) return
    const writer = port.value.writable.getWriter()
    try {
      await writer.write(new TextEncoder().encode(text))
    } finally {
      writer.releaseLock()
    }
  }

  const startReading = async () => {
    if (!port.value || !port.value.readable) return
    const reader = port.value.readable.getReader()
    currentReader = reader
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        const text = new TextDecoder().decode(value)
        if (sessionActive) sessionOnData?.(text)
        else consoleOnData?.(text)
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('❌ Reading error:', error)
      }
    } finally {
      if (currentReader === reader) currentReader = null
      reader.releaseLock()
    }
  }

  // Shell API
  const getConsoleShell = () => {
    return {
      send: async (text: string) => {
        if (sessionActive) return // paused during session
        await writeRaw(text)
      },
      onData: (cb: (data: string) => void) => {
        consoleOnData = cb
      },
      resize: (_cols?: number, _rows?: number) => { /* no-op */ },
    }
  }

  const openSession = async (reason: string) => {
    if (!isConnected.value) throw new Error('Not connected')
    if (sessionActive) throw new Error('Session already active')
    busy.value = { reason }
    sessionActive = true
    // Enter raw mode
    await writeRaw('\x01')
    await new Promise((r) => setTimeout(r, 50))

    return {
      send: async (text: string) => {
        await writeRaw(text)
      },
      onData: (cb: (data: string) => void) => {
        sessionOnData = cb
      },
      close: async () => {
        try {
          await writeRaw('\x04') // execute/exit
          await new Promise((r) => setTimeout(r, 50))
        } finally {
          sessionOnData = null
          sessionActive = false
          busy.value = null
        }
      },
    }
  }

  // Connection API
  const connect = async () => {
    try {
      port.value = await navigator.serial.requestPort()
      await port.value.open({
        baudRate: settings.value.baudRate,
        dataBits: settings.value.dataBits as any,
        stopBits: settings.value.stopBits as any,
        parity: settings.value.parity as any,
        flowControl: settings.value.flowControl as any,
      } as any)
      await port.value.setSignals({ dataTerminalReady: true, requestToSend: false })
      await new Promise((r) => setTimeout(r, 100))
      startReading()
      // Wake up REPL
      await new Promise((r) => setTimeout(r, 200))
      await writeRaw('\x03') // interrupt
      await new Promise((r) => setTimeout(r, 100))
      await writeRaw('\x04') // soft reset
      await new Promise((r) => setTimeout(r, 100))
      await writeRaw('\r\n') // prompt
    } catch (error) {
      console.error('Failed to connect:', error)
      port.value = null
    }
  }

  const disconnect = async () => {
    if (port.value) {
      if (currentReader) {
        try { await currentReader.cancel() } catch {}
        currentReader = null
      }
      try { await port.value.close() } catch {}
      port.value = null
      busy.value = null
      sessionOnData = null
      sessionActive = false
    }
  }

  return {
    // State
    port,
    settings,
    busy,
    // Derived
    isConnected,
    // API
    connect,
    disconnect,
    getConsoleShell,
    openSession,
  }
})
