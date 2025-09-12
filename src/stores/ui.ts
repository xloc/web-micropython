import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

export const useUIStore = defineStore('ui', () => {
  // State with localStorage persistence
  const splitOrientation = useLocalStorage<'horizontal' | 'vertical'>('micropython-ide-orientation', 'vertical')
  const splitRatio = useLocalStorage('micropython-ide-split-ratio', 0.5) // 0 = all editor, 1 = all console
  const isConsoleVisible = useLocalStorage('micropython-ide-console-visible', true)
  
  // Actions
  const setSplitOrientation = (orientation: 'horizontal' | 'vertical') => {
    splitOrientation.value = orientation
  }
  
  const updateSplitRatio = (ratio: number) => {
    splitRatio.value = Math.max(0, Math.min(1, ratio)) // Clamp between 0-1
  }
  
  const toggleConsole = () => {
    isConsoleVisible.value = !isConsoleVisible.value
  }
  
  const resetLayout = () => {
    splitOrientation.value = 'vertical'
    splitRatio.value = 0.5
    isConsoleVisible.value = true
  }
  
  return {
    // State
    splitOrientation,
    splitRatio,
    isConsoleVisible,
    // Actions
    setSplitOrientation,
    updateSplitRatio,
    toggleConsole,
    resetLayout
  }
})