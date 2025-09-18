<template>
  <div class="h-6 bg-emerald-900 text-zinc-200 text-xs flex items-center justify-between px-3">
    <!-- Left side - currently empty for future status items -->
    <div class="flex items-center space-x-4">
      <!-- Future status items will go here -->
    </div>

    <!-- Right side - Connection status -->
    <div class="flex items-center space-x-4">
      <div class="flex items-center space-x-1 px-2 py-0.5">
        <span>{{ connectionStatusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSerialStore } from '../stores/serial'

const serialStore = useSerialStore()

const connectionStatusText = computed(() => {
  if (serialStore.isConnected) {
    return 'Connected'
  }
  return 'Disconnected'
})

</script>