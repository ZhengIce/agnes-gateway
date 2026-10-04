<script setup>
import { computed, ref } from 'vue'
import { ArrowLeftRight, Plus, X, ImageOff } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ChatImageSource from '@/components/ChatImageSource.vue'
import { isMediaUrl } from '@/lib/chat-client'
import { validateImageUploads } from '@/lib/image-uploads'

const props = defineProps({ options: { type: Object, required: true }, disabled: Boolean })
defineEmits(['pick', 'clear', 'swap'])
const failed = ref(new Set())
const frames = computed(() => [
  { field: 'firstFrame', label: '首帧' }, { field: 'lastFrame', label: '尾帧' },
].map(frame => {
  const value = props.options[frame.field] || ''
  let url = ''
  if (isMediaUrl(value)) url = value.trim()
  else if (value) {
    try { validateImageUploads([value]); url = value } catch { /* Invalid input is never rendered. */ }
  }
  return { ...frame, url }
}))
</script>

<template>
  <div class="keyframe-cards" aria-label="首尾帧素材">
    <template v-for="(frame, index) in frames" :key="frame.field">
      <Button v-if="index === 1" type="button" variant="ghost" size="icon" class="frame-swap size-7 shrink-0 text-muted-foreground"
        aria-label="交换首尾帧" title="交换首尾帧" :disabled="disabled || !frames.some(item => item.url)" @click="$emit('swap')">
        <ArrowLeftRight class="size-3.5" :stroke-width="1.5" />
      </Button>
      <div class="frame-card" :class="index ? 'frame-card--last' : 'frame-card--first'">
        <ChatImageSource :disabled="disabled" @select="$emit('pick', frame.field, $event)">
          <button type="button" class="frame-pick" :class="{ 'frame-pick--filled': frame.url }" :disabled="disabled"
            :aria-label="`${frame.url ? '替换' : '选择'}${frame.label}`" :title="`${frame.url ? '替换' : '选择'}${frame.label}`">
          <template v-if="frame.url">
            <ImageOff v-if="failed.has(frame.url)" class="size-5 text-muted-foreground" />
            <img v-else :src="frame.url" :alt="frame.label" class="h-full w-full object-cover" referrerpolicy="no-referrer" decoding="async" @error="failed.add(frame.url)" />
            <span class="frame-caption">{{ frame.label }}</span>
          </template>
          <template v-else><Plus class="size-5" :stroke-width="1.5" /><span class="text-[10px]">{{ frame.label }}</span></template>
          </button>
        </ChatImageSource>
        <Button v-if="frame.url" type="button" variant="secondary" size="icon" class="absolute -top-1.5 -right-1.5 size-5 rounded-full border bg-card"
          :aria-label="`移除${frame.label}`" :title="`移除${frame.label}`" :disabled="disabled" @click="$emit('clear', frame.field)"><X class="size-3" /></Button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.keyframe-cards { display: flex; flex-shrink: 0; align-items: center; gap: 10px; align-self: flex-start; padding: 8px 4px; }
.frame-card { position: relative; flex-shrink: 0; width: 56px; height: 70px; }
.frame-card--first { transform: rotate(-6deg); }
.frame-card--last { transform: rotate(6deg); }
.frame-pick { display: flex; width: 100%; height: 100%; flex-direction: column; align-items: center; justify-content: center; gap: 2px; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--card); color: var(--muted-foreground); cursor: pointer; }
.frame-pick:hover:not(:disabled) { border-color: var(--ring); color: var(--foreground); background: var(--accent); }
.frame-pick:active:not(:disabled) { background: var(--muted); }
.frame-pick:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
.frame-pick:disabled { cursor: not-allowed; opacity: .5; }
.frame-pick--filled { gap: 0; }
.frame-caption { position: absolute; inset: auto 0 0; border-radius: 0 0 12px 12px; background: color-mix(in oklab, var(--card) 90%, transparent); padding: 3px; font-size: 10px; color: var(--foreground); }
</style>
