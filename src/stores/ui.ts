import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

export const useUIStore = defineStore('ui', () => {
  // Monotonic divisions array: [fileExplorerEnd, editorEnd]
  const divisions = useLocalStorage('micropython-ide-divisions', [0.2, 0.7])
  const isConsoleVisible = useLocalStorage('micropython-ide-console-visible', true)

  // Computed panel widths
  const fileExplorerWidth = computed(() => divisions.value[0])
  const editorWidth = computed(() =>
    isConsoleVisible.value
      ? divisions.value[1] - divisions.value[0]
      : 1 - divisions.value[0]
  )
  const consoleWidth = computed(() => 1 - divisions.value[1])

  // Legacy computed for backward compatibility
  const splitRatio = computed(() => divisions.value[1])

  // Actions
  const updateDivision = (index: number, value: number) => {
    const newDivisions = [...divisions.value]
    newDivisions[index] = value

    // Ensure monotonic and valid bounds
    if (index === 0) {
      newDivisions[0] = Math.max(0.1, Math.min(0.8, value))
      if (newDivisions[0] >= newDivisions[1]) {
        newDivisions[1] = Math.min(0.9, newDivisions[0] + 0.1)
      }
    } else if (index === 1) {
      newDivisions[1] = Math.max(newDivisions[0] + 0.1, Math.min(0.9, value))
    }

    divisions.value = newDivisions
  }

  const updateSplitRatio = (ratio: number) => {
    updateDivision(1, ratio)
  }

  const toggleConsole = () => {
    isConsoleVisible.value = !isConsoleVisible.value
  }

  const resetLayout = () => {
    divisions.value = [0.2, 0.7]
    isConsoleVisible.value = true
  }

  return {
    // State
    divisions,
    fileExplorerWidth,
    editorWidth,
    consoleWidth,
    splitRatio,
    isConsoleVisible,
    // Actions
    updateDivision,
    updateSplitRatio,
    toggleConsole,
    resetLayout
  }
})