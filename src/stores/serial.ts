import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useSerialStore = defineStore('serial', () => {
  // State
  const port = ref<SerialPort | null>(null)
  const isConnected = ref(false)
  const isRawMode = ref(false)
  const userInputEnabled = ref(true)
  const syncProgress = ref<{ current: number; total: number; currentFile: string; operation: string } | null>(null)

  // Computed properties
  const isUploading = computed(() => syncProgress.value !== null)

  // Callbacks for handling data
  let onDataReceived: ((data: string) => void) | null = null
  let onInfoMessage: ((message: string) => void) | null = null

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

      if (onInfoMessage) onInfoMessage('Send Ctrl-c Ctrl-d \\r\\n (interrupt, soft reset, show prompt)')

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

    syncProgress.value = { current: 1, total: 1, currentFile: 'code', operation: 'Uploading code' }

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
      syncProgress.value = null
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

  const setInfoCallback = (callback: (message: string) => void) => {
    onInfoMessage = callback
  }

  // Helper function to escape Python string content
  const escapePythonString = (content: string): string => {
    return content
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
  }

  // Helper function to collect all files recursively from file tree
  const getAllFilesRecursively = (node: any): Array<{ path: string; content: string }> => {
    const files: Array<{ path: string; content: string }> = []

    if (node.type === 'file') {
      // We'll need to read the file content from the file system store
      files.push({ path: node.path, content: '' }) // Content will be filled later
    } else if (node.type === 'directory' && node.children) {
      for (const child of node.children) {
        files.push(...getAllFilesRecursively(child))
      }
    }

    return files
  }

  // Helper function to get all unique directory paths
  const getAllDirectoryPaths = (files: Array<{ path: string; content: string }>): string[] => {
    const dirPaths = new Set<string>()

    for (const file of files) {
      const pathParts = file.path.split('/')
      pathParts.pop() // Remove filename

      // Build directory path incrementally (to ensure parent dirs are created first)
      let currentPath = ''
      for (const part of pathParts) {
        if (part && part !== 'mnt') { // Skip empty parts and 'mnt' root
          currentPath += (currentPath ? '/' : '') + part
          if (currentPath) {
            dirPaths.add(currentPath)
          }
        }
      }
    }

    return Array.from(dirPaths).sort() // Sort to ensure parent dirs come first
  }

  // Create a directory on the MicroPython device
  const createRemoteDirectory = async (dirPath: string) => {
    const command = `
import os
try:
    os.makedirs('${dirPath}', exist_ok=True)
    # print('DIR_CREATED: ${dirPath}')
except Exception as e:
    print('DIR_ERROR:', e)
`
    await sendText(command)
  }

  // Write a file to the MicroPython device
  const writeRemoteFile = async (filePath: string, content: string) => {
    // Remove /mnt prefix for the device path
    const devicePath = filePath.replace(/^\/mnt\//, '')
    const escapedContent = escapePythonString(content)

    const command = `
try:
    with open('${devicePath}', 'w') as f:
        f.write('${escapedContent}')
    # print('FILE_WRITTEN: ${devicePath}')
except Exception as e:
    print('FILE_ERROR:', e)
`
    await sendText(command)
  }

  // Main sync function
  const syncProject = async (fileSystemStore: any) => {
    if (!isConnected.value || !fileSystemStore.fileTree) {
      if (onInfoMessage) onInfoMessage('❌ Cannot sync: Not connected or no files to sync')
      return
    }

    try {
      // Start sync process
      syncProgress.value = { current: 0, total: 0, currentFile: '', operation: 'Preparing sync...' }

      if (onInfoMessage) onInfoMessage('🚀 Starting project sync...')

      // Collect all files from the file tree
      const allFiles = getAllFilesRecursively(fileSystemStore.fileTree)

      // Read actual file contents
      for (const file of allFiles) {
        const openFile = fileSystemStore.openFiles.get(file.path)
        if (openFile) {
          file.content = openFile.content
        } else {
          // Read file content from the file system if not already open
          try {
            await fileSystemStore.openFile(file.path)
            const openedFile = fileSystemStore.openFiles.get(file.path)
            file.content = openedFile?.content || ''
          } catch (error) {
            console.warn(`Could not read file ${file.path}:`, error)
            file.content = ''
          }
        }
      }

      // Get all directory paths
      const directories = getAllDirectoryPaths(allFiles)
      const totalOperations = directories.length + allFiles.length

      syncProgress.value = {
        current: 0,
        total: totalOperations,
        currentFile: '',
        operation: 'Entering raw mode...'
      }

      // Enter raw mode
      await enterRawMode()
      await new Promise(resolve => setTimeout(resolve, 100)) // Small delay

      // Create directories first
      for (let i = 0; i < directories.length; i++) {
        const dirPath = directories[i]
        syncProgress.value = {
          current: i + 1,
          total: totalOperations,
          currentFile: dirPath,
          operation: 'Creating directory'
        }

        await createRemoteDirectory(dirPath)
        await new Promise(resolve => setTimeout(resolve, 50)) // Small delay between operations
      }

      // Upload files
      for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i]
        syncProgress.value = {
          current: directories.length + i + 1,
          total: totalOperations,
          currentFile: file.path,
          operation: 'Uploading file'
        }

        await writeRemoteFile(file.path, file.content)
        await new Promise(resolve => setTimeout(resolve, 50)) // Small delay between operations
      }

      // Exit raw mode
      await exitRawMode()

      if (onInfoMessage) onInfoMessage(`✅ Sync completed: ${allFiles.length} files uploaded`)

    } catch (error) {
      console.error('Sync failed:', error)
      if (onInfoMessage) onInfoMessage(`❌ Sync failed: ${error}`)

      // Ensure we exit raw mode even on error
      try {
        await exitRawMode()
      } catch (exitError) {
        console.error('Failed to exit raw mode:', exitError)
      }
    } finally {
      syncProgress.value = null
    }
  }
  
  return {
    // State
    port,
    isConnected,
    isUploading,
    isRawMode,
    userInputEnabled,
    syncProgress,
    // Actions
    connect,
    disconnect,
    sendText,
    uploadCode,
    syncProject,
    setDataCallback,
    setInfoCallback
  }
})