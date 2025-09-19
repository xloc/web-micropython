<template>
  <img
    :src="iconSrc"
    :alt="iconName"
    :class="['file-icon', $attrs.class]"
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getFileIcon, getFolderIcon, getIconPath } from '../utils/fileIcons'

interface Props {
  fileName?: string
  isFolder?: boolean
  isOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isFolder: false,
  isOpen: false
})

const iconName = computed(() => {
  if (props.isFolder) {
    return getFolderIcon(props.fileName || '', props.isOpen)
  }
  return getFileIcon(props.fileName || '')
})

const iconSrc = computed(() => {
  return getIconPath(iconName.value)
})
</script>

<style scoped>
.file-icon {
  display: inline-block;
  flex-shrink: 0;
}
</style>