<script setup>
import { computed, useId } from 'vue'
import { Scan, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { VIDEO_RATIOS } from '@/lib/chat-client'

const props = defineProps({ kind: String, model: String, options: { type: Object, required: true }, disabled: Boolean })
const emit = defineEmits(['update:options', 'close'])
const id = useId()
const ratios = ['auto', '9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9', '21:9']
const choices = values => values.map(value => ({ value, label: value === 'auto' ? 'Auto' : String(value) }))
const groups = computed(() => props.kind === 'image' ? [
  { field: 'imageRatio', label: '比例', aria: '图片比例', ratio: true, items: choices(ratios) },
  { field: 'imageSize', label: '分辨率', aria: '图片尺寸', items: choices(['1K', '2K', '3K', '4K']) },
] : [
  { field: 'videoRatio', label: '比例', aria: '视频比例', ratio: true, items: choices(ratios.filter(value => VIDEO_RATIOS.includes(value))) },
  { field: 'videoSize', label: '分辨率', aria: '视频分辨率', items: choices(props.model === 'agnes-video-2.5-flash' ? ['720P'] : ['720P', '1080P', '1K', '2K']) },
  { field: 'seconds', label: '时长', aria: '视频时长', items: Array.from({ length: 9 }, (_, i) => ({ value: i + 4, label: `${i + 4}s` })) },
])
function ratioStyle(value) {
  const [width, height] = value.split(':').map(Number)
  const scale = 16 / Math.max(width, height)
  return { width: `${width * scale}px`, height: `${height * scale}px` }
}
</script>

<template>
  <section class="generation-settings" aria-label="生成设置">
    <header class="mb-4 flex items-center justify-between">
      <h2 class="text-base font-medium">设置</h2>
      <Button type="button" variant="ghost" size="icon" class="size-7 rounded-full text-muted-foreground" aria-label="关闭生成设置" @click="$emit('close')"><X class="size-4" /></Button>
    </header>
    <div class="space-y-4">
      <fieldset v-for="group in groups" :key="group.field" :aria-label="group.aria" :disabled="disabled" class="min-w-0">
        <legend class="mb-2 text-xs text-muted-foreground">{{ group.label }}</legend>
        <div class="setting-track" :class="{ 'ratio-track': group.ratio, 'duration-track': group.field === 'seconds' }" :style="{ '--choice-count': group.items.length }">
          <label v-for="item in group.items" :key="item.value" class="setting-choice">
            <input type="radio" class="peer sr-only" :name="`${id}-${group.field}`" :value="item.value" :checked="options[group.field] === item.value"
              :aria-label="`${group.label} ${item.label}`" @change="emit('update:options', { ...options, [group.field]: item.value })" />
            <span class="setting-option peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
              :class="{ 'ratio-option': group.ratio }" :title="item.value === 'auto' ? '使用模型默认比例' : undefined">
              <span v-if="group.ratio" class="flex h-5 items-center justify-center text-muted-foreground" aria-hidden="true">
                <Scan v-if="item.value === 'auto'" class="size-5" :stroke-width="1.5" />
                <span v-else class="inline-block rounded-[2px] border-[1.5px] border-current" :style="ratioStyle(item.value)" />
              </span>
              <span>{{ item.label }}</span>
            </span>
          </label>
        </div>
      </fieldset>
    </div>
  </section>
</template>

<style scoped>
.setting-track { display: grid; grid-template-columns: repeat(var(--choice-count), minmax(0, 1fr)); gap: 4px; padding: 4px; background: var(--muted); border-radius: 14px; }
.setting-choice { position: relative; min-width: 0; cursor: pointer; }
.setting-option { display: flex; min-height: 44px; align-items: center; justify-content: center; gap: 6px; border-radius: 10px; padding: 8px 4px; color: var(--muted-foreground); font-size: 12px; transition: background-color 120ms; }
.setting-choice:hover .setting-option { color: var(--foreground); }
.setting-choice:active .setting-option { background: var(--accent); }
.ratio-option { flex-direction: column; min-height: 64px; }
@media (max-width: 639px) {
  .ratio-track, .duration-track { grid-template-columns: repeat(5, minmax(0, 1fr)); }
}
@media (prefers-reduced-motion: reduce) { .setting-option { transition: none; } }
</style>
