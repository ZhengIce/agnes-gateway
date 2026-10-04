<script setup>
import { computed, ref, watch } from 'vue'
import { Check, ChevronLeft, ChevronRight, Images, Search, LoaderCircle, ImageOff } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useMediaLibrary } from '@/composables/useMediaLibrary'
import { isMediaUrl } from '@/lib/chat-client'

const props = defineProps({ open: Boolean, kind: String, videoMode: String, frameTarget: String, error: String })
const emit = defineEmits(['close', 'pick'])
const selected = ref([]), target = ref('firstFrame'), localError = ref('')
const failedImages = ref(new Set())
const { items, total, offset, query, loading, error: libraryError, pageSize, load, search } = useMediaLibrary(ref('image'))
const frameMode = computed(() => props.kind === 'video' && props.videoMode === 'keyframe')
const canPick = computed(() => !!selected.value.length)
const frames = [{ value: 'firstFrame', label: '首帧' }, { value: 'lastFrame', label: '尾帧' }]
watch(() => [props.open, props.frameTarget], ([open]) => {
  if (!open) return
  selected.value = []
  localError.value = ''
  target.value = props.frameTarget === 'lastFrame' ? 'lastFrame' : 'firstFrame'
  query.value = ''
  load(0, '')
}, { immediate: true })
function toggle(url) {
  if (!isMediaUrl(url)) return
  if (frameMode.value) selected.value = selected.value.includes(url) ? [] : [url]
  else selected.value = selected.value.includes(url) ? selected.value.filter(value => value !== url) : [...selected.value, url]
}
function pick() {
  localError.value = ''
  const urls = [...selected.value]
  if (!urls.length || urls.some(url => !isMediaUrl(url))) { localError.value = '请选择图片库中的有效图片'; return }
  if (frameMode.value && urls.length !== 1) { localError.value = '首帧或尾帧每次只能选择一张图片'; return }
  emit('pick', { urls, target: target.value })
}
</script>

<template>
  <div class="min-w-0 space-y-4">
      <Tabs v-if="frameMode && !frameTarget" v-model="target">
        <TabsList class="h-8"><TabsTrigger v-for="frame in frames" :key="frame.value" :value="frame.value" class="text-xs">{{ frame.label }}</TabsTrigger></TabsList>
      </Tabs>
      <div class="min-w-0 space-y-4">
          <form class="flex items-center gap-2" @submit.prevent="search">
            <div class="relative min-w-0 flex-1"><Search class="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input v-model="query" aria-label="搜索参考图片" placeholder="搜索提示词或模型" class="pl-9" /></div>
            <Button type="submit" variant="outline" size="sm" :disabled="loading">查询</Button>
          </form>
          <ErrorState :message="libraryError" @retry="load()" />
          <div v-if="loading" class="flex h-40 items-center justify-center"><LoaderCircle class="size-5 text-muted-foreground motion-safe:animate-spin" aria-label="加载图片库" /></div>
          <EmptyState v-else-if="!items.length && !libraryError" title="暂无匹配图片" :icon="Images" />
          <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <button v-for="asset in items" :key="asset.id" type="button" class="relative min-w-0 overflow-hidden rounded-md border text-left focus-visible:outline-2 focus-visible:outline-ring"
              :class="selected.includes(asset.url) ? 'ring-2 ring-foreground/70' : 'hover:border-foreground/40'"
              :aria-label="`选择图片 #${asset.id}`" :aria-pressed="selected.includes(asset.url)" @click="toggle(asset.url)">
              <div class="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/50">
                <ImageOff v-if="failedImages.has(asset.id)" class="size-6 text-muted-foreground" aria-label="预览不可用" />
                <img v-else :src="asset.url" :alt="asset.prompt || `图片 #${asset.id}`" class="h-full w-full object-contain" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="failedImages.add(asset.id)" />
              </div>
              <span class="block truncate px-2.5 py-2 text-[11px]">{{ asset.prompt || `图片 #${asset.id}` }}</span>
              <span v-if="selected.includes(asset.url)" class="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-foreground text-background"><Check class="size-3" /></span>
            </button>
          </div>
          <div v-if="total" class="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span>{{ offset + 1 }}–{{ Math.min(offset + pageSize, total) }} / {{ total }}</span>
            <div class="flex gap-2">
              <Button variant="outline" size="icon" class="size-8" aria-label="上一页参考图片" :disabled="loading || !offset" @click="load(offset - pageSize)"><ChevronLeft class="size-4" /></Button>
              <Button variant="outline" size="icon" class="size-8" aria-label="下一页参考图片" :disabled="loading || offset + pageSize >= total" @click="load(offset + pageSize)"><ChevronRight class="size-4" /></Button>
            </div>
          </div>
      </div>
      <p v-if="localError || error" role="alert" class="text-xs leading-5 text-destructive">{{ localError || error }}</p>
      <div class="flex items-center justify-end gap-2 border-t pt-4">
        <span v-if="selected.length" class="mr-auto text-xs text-muted-foreground">已选 {{ selected.length }} 张</span>
        <Button variant="outline" @click="$emit('close')">取消</Button>
        <Button :disabled="!canPick" @click="pick">添加参考</Button>
      </div>
  </div>
</template>
