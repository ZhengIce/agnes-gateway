<script setup>
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ChatReferenceContent from '@/components/ChatReferenceContent.vue'

defineProps({ open: Boolean, kind: String, videoMode: String, frameTarget: String, error: String })
defineEmits(['update:open', 'pick'])
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-h-[85dvh] overflow-y-auto sm:max-w-[740px]">
      <DialogHeader><DialogTitle>{{ frameTarget === 'firstFrame' ? '选择首帧' : frameTarget === 'lastFrame' ? '选择尾帧' : '图片库' }}</DialogTitle><DialogDescription class="sr-only">从图片库中选择已有图片</DialogDescription></DialogHeader>
      <ChatReferenceContent v-if="open" :open="open" :kind="kind" :video-mode="videoMode" :frame-target="frameTarget" :error="error"
        @close="$emit('update:open', false)" @pick="$emit('pick', $event)" />
    </DialogContent>
  </Dialog>
</template>
