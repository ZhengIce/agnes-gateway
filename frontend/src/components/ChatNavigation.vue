<script setup>
import { nextTick, ref, watch } from 'vue'
import { ArrowUpRight } from '@lucide/vue'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

const props = defineProps({ entries: { type: Array, default: () => [] }, activeId: String })
const emit = defineEmits(['select'])
const list = ref(null), previewId = ref('')
function select(id) { previewId.value = ''; emit('select', id) }
function changePreview(id, open) {
  if (open) previewId.value = id
  else if (previewId.value === id) previewId.value = ''
}
watch(() => props.activeId, async () => {
  await nextTick()
  const rail = list.value
  const active = rail?.querySelector('[aria-current="location"]')
  if (!active) return
  const bounds = rail.getBoundingClientRect(), item = active.getBoundingClientRect()
  if (item.top < bounds.top) rail.scrollTop -= bounds.top - item.top
  else if (item.bottom > bounds.bottom) rail.scrollTop += item.bottom - bounds.bottom
})
</script>

<template>
  <nav v-if="entries.length" ref="list" class="chat-navigation" aria-label="对话快速导航">
    <HoverCard v-for="entry in entries" :key="entry.id" :open="previewId === entry.id" :open-delay="120" :close-delay="100"
      @update:open="changePreview(entry.id, $event)">
      <HoverCardTrigger as-child>
        <button type="button" class="navigation-tick" :aria-current="activeId === entry.id ? 'location' : undefined"
          :aria-label="`跳转到第 ${entry.number} 轮：${entry.title}`"
          :aria-controls="`chat-message-${entry.id}`"
          @focus="previewId = entry.id" @blur="changePreview(entry.id, false)" @keydown.esc="previewId = ''" @click="select(entry.id)">
          <span class="tick-mark" aria-hidden="true" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="center" :side-offset="12" :collision-padding="16"
        class="w-80 max-w-[calc(100vw-64px)] rounded-xl p-3 shadow-lg motion-reduce:animate-none">
        <button type="button" class="block w-full rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
          :aria-label="`跳转到第 ${entry.number} 轮`" @click="select(entry.id)" @keydown.esc="previewId = ''">
          <span class="flex items-start gap-3">
            <span class="min-w-0 flex-1 line-clamp-2 break-words text-xs font-medium leading-5">{{ entry.title }}</span>
            <ArrowUpRight class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </span>
          <span class="mt-2 line-clamp-3 break-words text-xs leading-5 text-muted-foreground">{{ entry.preview }}</span>
        </button>
      </HoverCardContent>
    </HoverCard>
  </nav>
</template>

<style scoped>
.chat-navigation { width: 36px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; padding: 4px; }
.chat-navigation::-webkit-scrollbar { display: none; }
.navigation-tick { position: relative; display: flex; width: 28px; height: 28px; flex-shrink: 0; align-items: center; border-radius: 4px; cursor: pointer; }
.navigation-tick::before, .navigation-tick::after { content: ''; position: absolute; left: 0; width: 6px; height: 1px; background: var(--border); }
.navigation-tick::before { top: 4px; }
.navigation-tick::after { bottom: 4px; }
.tick-mark { width: 14px; height: 2px; border-radius: 1px; background: color-mix(in oklab, var(--muted-foreground) 45%, transparent); transition: width 150ms, background 150ms; }
.navigation-tick:hover .tick-mark, .navigation-tick:focus-visible .tick-mark { width: 22px; background: var(--foreground); }
.navigation-tick[aria-current] .tick-mark { width: 26px; background: var(--foreground); }
.navigation-tick:active { background: var(--muted); }
.navigation-tick:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) { .tick-mark { transition: none; } }
</style>
