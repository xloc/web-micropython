import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

// useLayoutStore — Layout: panel divisions, console toggle, layout reset.
export const useLayoutStore = defineStore('layout', () => {
  // Monotonic divisions array: [fileExplorerEnd, editorEnd]
  const divisions = useLocalStorage('micropython-ide-divisions', [0.2, 0.7])
  const consoleVisible = useLocalStorage('micropython-ide-console-visible', true)

  // Derived widths
  const fileExplorerWidth = computed(() => divisions.value[0])
  const editorWidth = computed(() =>
    consoleVisible.value ? divisions.value[1] - divisions.value[0] : 1 - divisions.value[0]
  )
  const consoleWidth = computed(() => 1 - divisions.value[1])

  // Action: updateDivision(index, value) (use original implementation)
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

  // Convenience actions for UI
  const toggleConsole = () => {
    consoleVisible.value = !consoleVisible.value
  }
  const resetLayout = () => {
    divisions.value = [0.2, 0.7]
    consoleVisible.value = true
  }

  return {
    // State
    divisions,
    consoleVisible,
    // Derived
    fileExplorerWidth,
    editorWidth,
    consoleWidth,
    // Actions
    updateDivision,
    toggleConsole,
    resetLayout,
  }
})
