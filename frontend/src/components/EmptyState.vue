<script setup>
import { Inbox } from '@lucide/vue'
defineProps({ title: { type: String, default: '暂无数据' }, description: String, icon: { default: Inbox } })
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-12 text-center">
    <component :is="icon" class="mb-4 size-7 text-muted-foreground/60" :stroke-width="1.4" />
    <p class="text-sm font-medium">{{ title }}</p>
    <p v-if="description" class="mt-1.5 max-w-sm text-xs leading-6 text-muted-foreground">{{ description }}</p>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
</template>

