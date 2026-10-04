<script setup>
import { AlertCircle, RotateCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
defineProps({ message: String })
defineEmits(['retry'])
</script>

<template>
  <div v-if="message" role="alert" class="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">
    <AlertCircle class="size-4 shrink-0 text-destructive" />
    <p class="min-w-0 flex-1 text-destructive">{{ message }}</p>
    <Button variant="ghost" size="sm" @click="$emit('retry')"><RotateCw class="size-3.5" />重新加载</Button>
  </div>
</template>

