<template>
  <div class="h-screen flex flex-col bg-gray-50">
    <!-- Main content area -->
    <div class="flex-1 overflow-hidden flex">
      <!-- File Explorer Panel -->
      <div class="w-64 border-r border-gray-300 bg-gray-100">
        <FileExplorer />
      </div>

      <!-- Editor and Console Panel -->
      <div class="flex-1 overflow-hidden">
        <SplitPane :split-ratio="uiStore.splitRatio"
          @update="uiStore.updateSplitRatio">
          <template #first>
            <EditorPanel />
          </template>

          <template #second>
            <ConsolePanel v-if="uiStore.isConsoleVisible" />
          </template>
        </SplitPane>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import SplitPane from './components/SplitPane.vue'
import EditorPanel from './components/EditorPanel.vue'
import ConsolePanel from './components/ConsolePanel.vue'
import FileExplorer from './components/FileExplorer.vue'
import { useUIStore } from './stores/ui'

const uiStore = useUIStore()
</script>
