<script setup>
import { computed, nextTick, onScopeDispose, ref, useId, watch } from 'vue'
import { Plus, X, LoaderCircle, ImageOff } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ChatImageSource from '@/components/ChatImageSource.vue'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

const props = defineProps({ items: { type: Array, default: () => [] }, disabled: Boolean, loading: Boolean })
const emit = defineEmits(['add', 'remove'])
const open = ref(false), pinned = ref(false), activeId = ref(''), failed = ref(new Set()), previewBody = ref(null)
const sourceOpen = ref(false)
const previewId = useId()
const stack = computed(() => props.items.slice(-3))
const activeIndex = computed(() => Math.max(0, props.items.findIndex(item => item.id === activeId.value)))
const active = computed(() => props.items[activeIndex.value])
let openTimer, closeTimer
function clearTimers() { clearTimeout(openTimer); clearTimeout(closeTimer) }
function enter(event) {
  if (sourceOpen.value || event.pointerType === 'touch') return
  clearTimers()
  openTimer = setTimeout(() => { open.value = true }, 100)
}
function leave(event) {
  if (event.pointerType === 'touch') return
  clearTimers()
  closeTimer = setTimeout(() => {
    if (!pinned.value && !previewBody.value?.contains(document.activeElement)) open.value = false
  }, 180)
}
function setOpen(value) {
  clearTimers()
  open.value = value
  if (!value) pinned.value = false
}
async function pinPreview() {
  sourceOpen.value = false
  clearTimers()
  pinned.value = true
  open.value = true
  await nextTick()
  previewBody.value?.focus({ preventScroll: true })
}
function add(source) {
  if (props.disabled) return
  setOpen(false)
  emit('add', source)
}
function removeActive() {
  if (!props.disabled && active.value) emit('remove', active.value)
}
watch(() => props.items.map(item => item.id), ids => {
  if (!ids.includes(activeId.value)) activeId.value = ids.at(-1) || ''
  failed.value = new Set([...failed.value].filter(id => ids.includes(id)))
  if (!ids.length) setOpen(false)
}, { immediate: true })
onScopeDispose(clearTimers)
watch(sourceOpen, value => { if (value) setOpen(false) }, { flush: 'sync' })
</script>

<template>
  <div class="attachment-control" :aria-label="items.length ? '已添加参考素材' : undefined" :aria-busy="loading">
    <ChatImageSource v-model:open="sourceOpen" :disabled="disabled" @select="add">
      <Button v-if="!items.length" type="button" variant="outline" size="icon" class="attachment-add"
        :disabled="disabled" aria-label="选择图片" title="选择图片">
        <LoaderCircle v-if="loading" class="size-5 motion-safe:animate-spin" /><Plus v-else class="size-5" :stroke-width="1.5" />
      </Button>
      <Button v-else type="button" variant="outline" size="icon" class="stack-add size-6 rounded-full bg-card shadow-sm"
        :disabled="disabled" aria-label="添加图片" title="添加图片">
        <LoaderCircle v-if="loading" class="size-3 motion-safe:animate-spin" /><Plus v-else class="size-3" />
      </Button>
    </ChatImageSource>
    <Popover v-if="items.length" :open="open" @update:open="setOpen">
      <PopoverAnchor as-child>
        <button type="button" class="attachment-stack" :aria-label="`预览已添加的 ${items.length} 张图片`"
          aria-haspopup="dialog" :aria-expanded="open" :aria-controls="previewId"
          @pointerenter="enter" @pointerleave="leave" @click="pinPreview" @keydown.esc="setOpen(false)">
          <span v-for="(item, index) in stack" :key="item.id" class="stack-photo"
            :style="{ '--offset': `${index * 5}px`, '--angle': `${-9 + index * 7}deg`, zIndex: index + 1 }">
            <ImageOff v-if="failed.has(item.id)" class="size-4 text-muted-foreground" />
            <img v-else :src="item.url" alt="" class="h-full w-full object-cover" decoding="async" referrerpolicy="no-referrer" @error="failed.add(item.id)" />
          </span>
          <span v-if="items.length > 1" class="stack-count" aria-hidden="true">{{ items.length }}</span>
        </button>
      </PopoverAnchor>
      <PopoverContent :id="previewId" side="top" align="start" :side-offset="12" :collision-padding="16"
        aria-label="已上传图片预览" class="w-80 max-w-[calc(100vw-32px)] rounded-2xl p-3 shadow-xl motion-reduce:animate-none"
        @pointerenter="enter" @pointerleave="leave" @open-auto-focus.prevent @close-auto-focus.prevent>
        <div ref="previewBody" tabindex="-1" class="outline-none" @keydown.esc="setOpen(false)">
          <div class="mb-2 flex items-center justify-between gap-3">
            <span class="text-xs text-muted-foreground">图片预览 <span class="ml-2 text-[10px] tabular-nums">{{ activeIndex + 1 }} / {{ items.length }}</span></span>
            <Button type="button" variant="ghost" size="icon" class="size-7 text-muted-foreground"
              aria-label="关闭图片预览" @click="setOpen(false)"><X class="size-3.5" /></Button>
          </div>
          <div v-if="active" class="relative flex h-56 max-h-[40dvh] items-center justify-center overflow-hidden rounded-xl border bg-muted/20">
            <ImageOff v-if="failed.has(active.id)" class="size-8 text-muted-foreground" />
            <img v-else :src="active.url" :alt="`参考图片 ${activeIndex + 1}`" class="h-full w-full object-contain"
              decoding="async" referrerpolicy="no-referrer" @error="failed.add(active.id)" />
            <Button type="button" variant="secondary" size="icon" class="absolute top-2 right-2 size-6 rounded-full border bg-card shadow-sm"
              :disabled="disabled" :aria-label="`移除图片 ${activeIndex + 1}`" title="移除图片" @click="removeActive"><X class="size-3" /></Button>
          </div>
          <div class="mt-3 flex items-center gap-2">
            <div class="flex min-w-0 flex-1 gap-2 overflow-x-auto p-1" aria-label="切换预览图片">
              <button v-for="(item, index) in items" :key="item.id" type="button"
                class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border focus-visible:outline-2 focus-visible:outline-ring"
                :class="active?.id === item.id ? 'ring-2 ring-foreground/60 ring-offset-2 ring-offset-card' : 'opacity-65 hover:opacity-100'"
                :aria-label="`预览图片 ${index + 1}`" :aria-pressed="active?.id === item.id" @click="activeId = item.id">
                <ImageOff v-if="failed.has(item.id)" class="size-4 text-muted-foreground" />
                <img v-else :src="item.url" alt="" class="h-full w-full object-cover" loading="lazy" referrerpolicy="no-referrer" @error="failed.add(item.id)" />
              </button>
            </div>
            <Button type="button" variant="outline" size="icon" class="size-10 shrink-0 rounded-md border-dashed"
              :disabled="disabled" aria-label="添加图片" title="添加图片" @click="sourceOpen = true"><Plus class="size-4" /></Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>

<style scoped>
.attachment-add { position: absolute; left: 3px; top: 7px; width: 52px; height: 62px; border-style: dashed; border-radius: 8px; transform: rotate(-6deg); background: var(--card); }
.attachment-control { position: relative; width: 72px; height: 80px; flex-shrink: 0; }
.attachment-stack { position: relative; width: 100%; height: 100%; border-radius: 8px; }
.attachment-stack:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
.stack-photo { position: absolute; left: calc(3px + var(--offset)); top: 7px; display: flex; width: 52px; height: 62px; align-items: center; justify-content: center; overflow: hidden; border: 2px solid var(--card); border-radius: 8px; background: var(--muted); box-shadow: 0 0 0 1px var(--border), 0 2px 5px color-mix(in oklab, var(--foreground) 8%, transparent); transform: rotate(var(--angle)); transition: transform 150ms; }
.stack-count { position: absolute; bottom: 6px; left: 0; z-index: 4; min-width: 18px; padding: 1px 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--muted-foreground); font-size: 10px; line-height: 14px; }
.stack-add { position: absolute; right: -2px; bottom: 2px; z-index: 5; }
@media (max-width: 639px) {
  .attachment-add { width: 42px; height: 52px; }
  .attachment-control { width: 62px; height: 70px; }
  .stack-photo { width: 42px; height: 52px; }
}
@media (prefers-reduced-motion: reduce) { .stack-photo, .attachment-add { transition: none; } }
</style>
