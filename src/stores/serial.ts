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

  // Protocol handshake buffer
  let protocolBuffer: Uint8Array = new Uint8Array(0)
  let protocolBufferActive = false

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

        // Route data based on current mode
        if (protocolBufferActive) {
          // Buffer raw bytes during protocol handshake
          const newBuffer = new Uint8Array(protocolBuffer.length + value.length)
          newBuffer.set(protocolBuffer)
          newBuffer.set(value, protocolBuffer.length)
          protocolBuffer = newBuffer
        } else {
          const text = new TextDecoder().decode(value)
          if (sessionActive) sessionOnData?.(text)
          else consoleOnData?.(text)
        }
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

  // Protocol helpers
  const readBytes = async (count: number, timeoutMs: number = 2000): Promise<Uint8Array | null> => {
    const startTime = Date.now()
    while (Date.now() - startTime < timeoutMs) {
      if (protocolBuffer.length >= count) {
        const result = protocolBuffer.slice(0, count)
        protocolBuffer = protocolBuffer.slice(count)
        return result
      }
      await new Promise((r) => setTimeout(r, 10))
    }
    return null // Timeout
  }

  const readUntil = async (marker: string, timeoutMs: number = 2000): Promise<string | null> => {
    const startTime = Date.now()
    const decoder = new TextDecoder()
    while (Date.now() - startTime < timeoutMs) {
      const text = decoder.decode(protocolBuffer)
      const idx = text.indexOf(marker)
      if (idx !== -1) {
        const result = text.substring(0, idx + marker.length)
        // Convert back to find byte position
        const consumedBytes = new TextEncoder().encode(result).length
        protocolBuffer = protocolBuffer.slice(consumedBytes)
        return result
      }
      await new Promise((r) => setTimeout(r, 10))
    }
    return null // Timeout
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

    // Enable protocol buffer to capture handshake responses
    protocolBufferActive = true
    protocolBuffer = new Uint8Array(0)

    let useRawPaste = false
    let windowSize = 0

    try {
      // Step 1: Enter raw REPL
      await writeRaw('\x01')
      const rawPrompt = await readUntil('>', 2000)
      if (!rawPrompt || !rawPrompt.includes('raw REPL')) {
        throw new Error('Failed to enter raw REPL')
      }

      // Step 2-5: Try to enter raw-paste mode
      await writeRaw('\x05A\x01')
      const response = await readBytes(2, 1000)

      if (response) {
        const r0 = response[0]
        const r1 = response[1]

        if (r0 === 0x52 && r1 === 0x01) { // "R\x01"
          // Device supports raw-paste mode
          useRawPaste = true
          const windowBytes = await readBytes(2, 1000)
          if (windowBytes) {
            // Read window size (16-bit little endian)
            windowSize = windowBytes[0] | (windowBytes[1] << 8)
            // Read initial flow control byte
            await readBytes(1, 1000)
          }
        } else if (r0 === 0x52 && r1 === 0x00) { // "R\x00"
          // Device doesn't support raw-paste, use standard raw mode
          useRawPaste = false
        } else if (r0 === 0x72 && r1 === 0x61) { // "ra" (from "raw REPL")
          // Old device, discard rest of prompt
          await readUntil('>', 1000)
          useRawPaste = false
        }
      }

      // Disable protocol buffer, return to normal data routing
      protocolBufferActive = false

    } catch (error) {
      protocolBufferActive = false
      sessionActive = false
      busy.value = null
      throw error
    }

    return {
      send: async (text: string) => {
        if (useRawPaste) {
          // Step 6-8: Raw-paste mode with flow control
          const encoder = new TextEncoder()
          const data = encoder.encode(text)
          let offset = 0
          let remaining = windowSize

          while (offset < data.length) {
            const chunk = data.slice(offset, offset + remaining)
            await writeRaw(new TextDecoder().decode(chunk))
            offset += chunk.length
            remaining -= chunk.length

            if (remaining === 0 && offset < data.length) {
              // Wait for flow control byte
              protocolBufferActive = true
              const flowByte = await readBytes(1, 5000)
              protocolBufferActive = false
              if (flowByte && flowByte[0] === 0x01) {
                remaining = windowSize
              } else if (flowByte && flowByte[0] === 0x04) {
                break // Device wants to stop
              }
            }
          }

          // Send end-of-data
          await writeRaw('\x04')

          // Wait for compilation confirmation
          protocolBufferActive = true
          await readBytes(1, 5000) // Should be \x04
          protocolBufferActive = false

        } else {
          // Standard raw mode: just send the text
          await writeRaw(text)
          await writeRaw('\x04')
        }
      },
      onData: (cb: (data: string) => void) => {
        sessionOnData = cb
      },
      writeTerminal: (message: string) => {
        // Send message directly to console (bypasses session routing)
        consoleOnData?.(message)
      },
      close: async () => {
        try {
          // Wait a bit for output to complete
          await new Promise((r) => setTimeout(r, 100))

          // Restore console routing before exiting raw mode
          // so the prompt goes to the console
          sessionActive = false

          // Step 7: Exit raw REPL to friendly REPL
          await writeRaw('\x02')
          await new Promise((r) => setTimeout(r, 50))
        } finally {
          sessionOnData = null
          busy.value = null
          protocolBuffer = new Uint8Array(0)
          protocolBufferActive = false
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
