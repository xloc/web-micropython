<template>
  <div class="h-screen flex flex-col bg-gray-50">
    <!-- Tab bar -->
    <TabBar />

    <!-- Main content area -->
    <div class="flex-1 overflow-hidden">
      <SplitPane :orientation="uiStore.splitOrientation" :split-ratio="uiStore.splitRatio"
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
</template>

<script setup lang="ts">
import TabBar from './components/TabBar.vue'
import SplitPane from './components/SplitPane.vue'
import EditorPanel from './components/EditorPanel.vue'
import ConsolePanel from './components/ConsolePanel.vue'
import { useUIStore } from './stores/ui'

const uiStore = useUIStore()
</script>
